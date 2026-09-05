//! # Ronda Ciega
//!
//! Blind stable matching on Solana.
//!
//! Participants submit a ranked list of who they want to work with. The lists
//! are written to accounts that live **only** inside a MagicBlock Private
//! Ephemeral Rollup, behind a permission whose single member is the author, and
//! they are closed there without ever being committed to L1. Gale–Shapley runs
//! inside the TEE, one proposal round per transaction, and the only thing that
//! ever becomes public is the final set of pairings.
//!
//! The distinction that justifies the whole design: a commit-reveal scheme
//! cannot do this. Commit-reveal buys secrecy *until a deadline*, because
//! verification requires publishing the preimage. A preference list has to stay
//! secret permanently — the moment it is revealed, the social cost the
//! mechanism removed simply arrives late. See `docs/SPEC.md` section 2.
//!
//! Delegation, permission and ephemeral-account plumbing follows the patterns in
//! `magicblock-engine-examples/private-counter`.

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{
    access_control::{
        instructions::CreateEphemeralPermissionCpi,
        structs::{
            EphemeralMembersArgs, EphemeralPermission, Member, AUTHORITY_FLAG, TX_BALANCES_FLAG,
            TX_LOGS_FLAG, TX_MESSAGE_FLAG,
        },
    },
    anchor::{delegate, ephemeral, ephemeral_accounts},
    consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID},
    cpi::DelegateConfig,
};

mod error;
mod state;

use error::ErrorCode;
use state::{
    MatchState, Participant, Preferences, Round, RoundStatus, Side, MAX_HANDLE_LEN, MAX_LINK_LEN,
    MAX_PER_SIDE, NONE, UNRANKED,
};

declare_id!("5VBYCgdVwAELHuCwQgTXDB7czV9wvz65gYN3bCR9Nq9R");

pub const ROUND_SEED: &[u8] = b"round";
pub const PARTICIPANT_SEED: &[u8] = b"participant";
pub const PREFERENCES_SEED: &[u8] = b"preferences";
pub const MATCH_STATE_SEED: &[u8] = b"match_state";

/// Members on a `Preferences` permission: the owner, plus the round PDA that
/// pays its rent and therefore needs authority over it.
const PREFERENCES_PERMISSION_MEMBERS: usize = 2;

#[ephemeral]
#[program]
pub mod ronda_ciega {
    use super::*;

    // ---------------------------------------------------------------- L1 ---

    /// Open a round. Prefunds the round PDA for the `MatchState` it will
    /// sponsor inside the rollup; per-participant rent is collected at join
    /// time instead, so opening a round stays cheap.
    pub fn init_round(
        ctx: Context<InitRound>,
        round_id: u64,
        deadline_ts: i64,
        min_per_side: u8,
    ) -> Result<()> {
        require!(
            deadline_ts > Clock::get()?.unix_timestamp,
            ErrorCode::DeadlineInPast
        );
        require!(min_per_side >= 2, ErrorCode::NotEnoughParticipants);

        let prefund = ephemeral_rollups_sdk::ephemeral_accounts::rent(
            (8 + MatchState::LEN) as u32,
        )
        .checked_add(ephemeral_rollups_sdk::ephemeral_accounts::rent(
            EphemeralPermission::size_of(1) as u32,
        ))
        .ok_or(ErrorCode::MathOverflow)?;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.round.to_account_info(),
                },
            ),
            prefund,
        )?;

        let round = &mut ctx.accounts.round;
        round.authority = ctx.accounts.authority.key();
        round.round_id = round_id;
        round.deadline_ts = deadline_ts;
        round.min_per_side = min_per_side;
        round.founder_count = 0;
        round.builder_count = 0;
        round.ranking_count = 0;
        round.sealed_count = 0;
        round.tick = 0;
        round.pairs = [NONE; MAX_PER_SIDE];
        round.status = RoundStatus::Open;
        round.randomness = [0u8; 32];
        round.randomness_fulfilled = false;
        round.bump = ctx.bumps.round;

        emit!(RoundOpened {
            round: round.key(),
            round_id,
            deadline_ts,
        });
        Ok(())
    }

    /// Publish your profile and claim an index on one side of the market. The
    /// profile is public on purpose — what stays private is never who you are,
    /// only who you want.
    ///
    /// The joiner also prefunds the round PDA for the private `Preferences`
    /// account and permission it will later sponsor on their behalf.
    pub fn join_round(
        ctx: Context<JoinRound>,
        round_id: u64,
        side: Side,
        handle: String,
        link: String,
    ) -> Result<()> {
        require_eq!(ctx.accounts.round.round_id, round_id);
        require!(
            ctx.accounts.round.status == RoundStatus::Open,
            ErrorCode::RoundClosed
        );
        require!(
            Clock::get()?.unix_timestamp < ctx.accounts.round.deadline_ts,
            ErrorCode::RoundClosed
        );
        require!(
            handle.len() <= MAX_HANDLE_LEN && link.len() <= MAX_LINK_LEN,
            ErrorCode::ProfileTooLong
        );

        let index = match side {
            Side::Founder => ctx.accounts.round.founder_count,
            Side::Builder => ctx.accounts.round.builder_count,
        };
        require!((index as usize) < MAX_PER_SIDE, ErrorCode::SideFull);

        let prefund = ephemeral_rollups_sdk::ephemeral_accounts::rent(
            (8 + Preferences::LEN) as u32,
        )
        .checked_add(ephemeral_rollups_sdk::ephemeral_accounts::rent(
            EphemeralPermission::size_of(PREFERENCES_PERMISSION_MEMBERS) as u32,
        ))
        .ok_or(ErrorCode::MathOverflow)?;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.wallet.to_account_info(),
                    to: ctx.accounts.round.to_account_info(),
                },
            ),
            prefund,
        )?;

        let participant = &mut ctx.accounts.participant;
        participant.round = ctx.accounts.round.key();
        participant.wallet = ctx.accounts.wallet.key();
        participant.side = side;
        participant.index = index;
        participant.handle = handle;
        participant.link = link;
        participant.bump = ctx.bumps.participant;

        match side {
            Side::Founder => ctx.accounts.round.founder_count = index + 1,
            Side::Builder => ctx.accounts.round.builder_count = index + 1,
        }

        emit!(ParticipantJoined {
            round: ctx.accounts.round.key(),
            wallet: ctx.accounts.wallet.key(),
            side,
            index,
        });
        Ok(())
    }

    /// Hand the round to the TEE validator. Everything after this point runs
    /// inside the rollup.
    pub fn delegate_round(ctx: Context<DelegateRound>, round_id: u64) -> Result<()> {
        let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
        let authority = ctx.accounts.authority.key();
        let round_id_bytes = round_id.to_le_bytes();
        ctx.accounts.delegate_round(
            &ctx.accounts.authority,
            &[ROUND_SEED, authority.as_ref(), &round_id_bytes],
            DelegateConfig {
                validator,
                ..Default::default()
            },
        )?;
        Ok(())
    }

    // ---------------------------------------------- Ephemeral rollup (TEE) ---

    /// Create the algorithm's working memory inside the rollup, private with an
    /// empty member list: no wallet can read it, only the program can touch it.
    pub fn init_match_state(ctx: Context<InitMatchState>, round_id: u64) -> Result<()> {
        require_eq!(ctx.accounts.round.round_id, round_id);
        if !ctx.accounts.match_state.data_is_empty() {
            return Ok(());
        }

        ctx.accounts
            .create_ephemeral_match_state((8 + MatchState::LEN) as u32)?;

        let round_key = ctx.accounts.round.key();
        let ms = MatchState {
            round: round_key,
            founder_ranking: [[NONE; MAX_PER_SIDE]; MAX_PER_SIDE],
            founder_len: [0u8; MAX_PER_SIDE],
            builder_rank: [[UNRANKED; MAX_PER_SIDE]; MAX_PER_SIDE],
            cursor: [0u8; MAX_PER_SIDE],
            hold: [NONE; MAX_PER_SIDE],
            bump: ctx.bumps.match_state,
        };
        write_account(&ctx.accounts.match_state.to_account_info(), &ms)?;

        let round_seeds = round_signer_seeds(&ctx.accounts.round);
        let ms_bump = [ctx.bumps.match_state];
        let ms_seeds: &[&[u8]] = &[MATCH_STATE_SEED, round_key.as_ref(), &ms_bump];

        CreateEphemeralPermissionCpi {
            payer: ctx.accounts.round.to_account_info(),
            permissioned_account: ctx.accounts.match_state.to_account_info(),
            permission: ctx.accounts.match_state_permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            args: EphemeralMembersArgs {
                is_private: true,
                members: vec![],
            },
        }
        .invoke_signed(&[&round_seeds.as_slice_refs(), ms_seeds])?;

        Ok(())
    }

    /// Submit a private ranking.
    ///
    /// The account is created here, inside the rollup, and immediately sealed
    /// behind a permission whose only wallet member is the author. It is never
    /// delegated back to L1 and never revealed — not at the deadline, not after
    /// settlement, not ever.
    pub fn submit_ranking(
        ctx: Context<SubmitRanking>,
        round_id: u64,
        ranking: Vec<u8>,
    ) -> Result<()> {
        require_eq!(ctx.accounts.round.round_id, round_id);
        require!(
            ctx.accounts.round.status == RoundStatus::Open,
            ErrorCode::RoundClosed
        );
        require_keys_eq!(
            ctx.accounts.participant.wallet,
            ctx.accounts.wallet.key(),
            ErrorCode::InvalidSession
        );
        require_keys_eq!(
            ctx.accounts.participant.round,
            ctx.accounts.round.key(),
            ErrorCode::WrongRound
        );

        // A ranking may be shorter than the other side (you are allowed to
        // simply not want most people) but never longer, never empty, and never
        // repeat someone.
        let opposite_count = match ctx.accounts.participant.side {
            Side::Founder => ctx.accounts.round.builder_count,
            Side::Builder => ctx.accounts.round.founder_count,
        };
        require!(
            !ranking.is_empty() && ranking.len() <= opposite_count as usize,
            ErrorCode::InvalidRanking
        );
        let mut seen = [false; MAX_PER_SIDE];
        for entry in ranking.iter() {
            let idx = *entry as usize;
            require!(idx < opposite_count as usize, ErrorCode::InvalidRanking);
            require!(!seen[idx], ErrorCode::DuplicateInRanking);
            seen[idx] = true;
        }

        let first_submission = ctx.accounts.preferences.data_is_empty();
        if first_submission {
            ctx.accounts
                .create_ephemeral_preferences((8 + Preferences::LEN) as u32)?;
        }

        let mut fixed = [NONE; MAX_PER_SIDE];
        fixed[..ranking.len()].copy_from_slice(&ranking);

        let prefs = Preferences {
            round: ctx.accounts.round.key(),
            owner: ctx.accounts.wallet.key(),
            side: ctx.accounts.participant.side,
            index: ctx.accounts.participant.index,
            len: ranking.len() as u8,
            ranking: fixed,
            bump: ctx.bumps.preferences,
        };
        write_account(&ctx.accounts.preferences.to_account_info(), &prefs)?;

        if first_submission {
            let round_key = ctx.accounts.round.key();
            let round_seeds = round_signer_seeds(&ctx.accounts.round);
            let prefs_bump = [ctx.bumps.preferences];
            let wallet_key = ctx.accounts.wallet.key();
            let prefs_seeds: &[&[u8]] = &[
                PREFERENCES_SEED,
                round_key.as_ref(),
                wallet_key.as_ref(),
                &prefs_bump,
            ];

            CreateEphemeralPermissionCpi {
                payer: ctx.accounts.round.to_account_info(),
                permissioned_account: ctx.accounts.preferences.to_account_info(),
                permission: ctx.accounts.preferences_permission.to_account_info(),
                vault: ctx.accounts.ephemeral_vault.to_account_info(),
                magic_program: ctx.accounts.magic_program.to_account_info(),
                permission_program: ctx.accounts.permission_program.to_account_info(),
                args: EphemeralMembersArgs {
                    is_private: true,
                    members: vec![
                        permission_member(wallet_key),
                        permission_member(round_key),
                    ],
                },
            }
            .invoke_signed(&[&round_seeds.as_slice_refs(), prefs_seeds])?;

            ctx.accounts.round.ranking_count = ctx
                .accounts
                .round
                .ranking_count
                .checked_add(1)
                .ok_or(ErrorCode::MathOverflow)?;
        }

        // Deliberately no `emit!` carrying the ranking. The event says a
        // ranking landed, never what was in it.
        emit!(RankingSubmitted {
            round: ctx.accounts.round.key(),
            side: ctx.accounts.participant.side,
            index: ctx.accounts.participant.index,
            revision: !first_submission,
        });
        Ok(())
    }

    /// Deadline reached: stop taking rankings, start ingesting them.
    pub fn close_round(ctx: Context<CloseRound>, round_id: u64) -> Result<()> {
        let round = &mut ctx.accounts.round;
        require_eq!(round.round_id, round_id);
        require!(round.status == RoundStatus::Open, ErrorCode::WrongRoundStatus);
        require!(
            Clock::get()?.unix_timestamp >= round.deadline_ts,
            ErrorCode::RoundStillOpen
        );
        require!(
            round.founder_count >= round.min_per_side
                && round.builder_count >= round.min_per_side,
            ErrorCode::NotEnoughParticipants
        );

        round.status = RoundStatus::Sealing;
        emit!(RoundClosed {
            round: round.key(),
            founder_count: round.founder_count,
            builder_count: round.builder_count,
        });
        Ok(())
    }

    /// Copy rankings out of the individual private accounts and into the
    /// private working memory, in chunks passed via `remaining_accounts`.
    ///
    /// Builders' lists are stored inverted — `builder_rank[b][f]` is founder
    /// f's position in builder b's list — which is what turns the "does this
    /// builder prefer the new proposer?" question in a tick into one array
    /// lookup instead of a scan.
    pub fn seal_preferences(ctx: Context<SealPreferences>, round_id: u64) -> Result<()> {
        require_eq!(ctx.accounts.round.round_id, round_id);
        require!(
            ctx.accounts.round.status == RoundStatus::Sealing,
            ErrorCode::WrongRoundStatus
        );

        let round_key = ctx.accounts.round.key();
        let match_state_info = ctx.accounts.match_state.to_account_info();
        let mut ms: MatchState = read_account(&match_state_info)?;
        let mut ingested: u8 = 0;

        for info in ctx.remaining_accounts.iter() {
            let prefs: Preferences = read_account(info)?;
            require_keys_eq!(prefs.round, round_key, ErrorCode::WrongRound);

            let idx = prefs.index as usize;
            require!(idx < MAX_PER_SIDE, ErrorCode::InvalidRanking);
            let len = prefs.len as usize;
            require!(len <= MAX_PER_SIDE, ErrorCode::InvalidRanking);

            match prefs.side {
                Side::Founder => {
                    require!(ms.founder_len[idx] == 0, ErrorCode::AlreadySealed);
                    ms.founder_ranking[idx] = prefs.ranking;
                    ms.founder_len[idx] = prefs.len;
                }
                Side::Builder => {
                    // `UNRANKED` everywhere means "did not list them"; a real
                    // rank overwrites it. Position 0 is the top choice.
                    for (rank, founder_idx) in prefs.ranking[..len].iter().enumerate() {
                        let f = *founder_idx as usize;
                        require!(f < MAX_PER_SIDE, ErrorCode::InvalidRanking);
                        require!(
                            ms.builder_rank[idx][f] == UNRANKED,
                            ErrorCode::AlreadySealed
                        );
                        ms.builder_rank[idx][f] = rank as u8;
                    }
                }
            }

            ingested = ingested.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
        }

        write_account(&match_state_info, &ms)?;

        let round = &mut ctx.accounts.round;
        round.sealed_count = round
            .sealed_count
            .checked_add(ingested)
            .ok_or(ErrorCode::MathOverflow)?;

        if round.sealed_count >= round.ranking_count {
            round.status = RoundStatus::Matching;
            emit!(MatchingStarted {
                round: round_key,
                sealed_count: round.sealed_count,
            });
        }
        Ok(())
    }

    /// One proposal round of Gale–Shapley. This is the unit the whole design
    /// is built around: O(n) work, one small transaction, and at ~10 ms per
    /// rollup block the entire matching resolves in under a second with every
    /// intermediate state observable.
    ///
    /// Each still-unmatched founder proposes to the next builder on their list.
    /// A builder holding nobody accepts. A builder already holding someone keeps
    /// whichever of the two they rank higher and releases the other, who will
    /// propose again on the next tick.
    pub fn tick(ctx: Context<Tick>, round_id: u64) -> Result<()> {
        require_eq!(ctx.accounts.round.round_id, round_id);
        require!(
            ctx.accounts.round.status == RoundStatus::Matching,
            ErrorCode::WrongRoundStatus
        );

        let round_key = ctx.accounts.round.key();
        let match_state_info = ctx.accounts.match_state.to_account_info();
        let mut ms: MatchState = read_account(&match_state_info)?;

        let founder_count = ctx.accounts.round.founder_count as usize;
        let mut pairs = ctx.accounts.round.pairs;
        let randomness = ctx.accounts.round.randomness;
        let mut proposals: u8 = 0;

        for f in 0..founder_count {
            // Already tentatively held by someone: nothing to do this tick.
            if pairs[f] != NONE {
                continue;
            }
            let cursor = ms.cursor[f] as usize;
            // Ran out of list: this founder finishes the round unmatched.
            if cursor >= ms.founder_len[f] as usize {
                continue;
            }

            let b = ms.founder_ranking[f][cursor] as usize;
            ms.cursor[f] = (cursor + 1) as u8;
            proposals = proposals.saturating_add(1);

            let incumbent = ms.hold[b];
            if incumbent == NONE {
                ms.hold[b] = f as u8;
                pairs[f] = b as u8;
                continue;
            }

            let challenger_rank = ms.builder_rank[b][f];
            let incumbent_rank = ms.builder_rank[b][incumbent as usize];

            let challenger_wins = if challenger_rank != incumbent_rank {
                // Lower rank is better; UNRANKED loses to every real rank.
                challenger_rank < incumbent_rank
            } else {
                // Only reachable when the builder ranked neither of them. Index
                // order would hand the slot to whoever registered first, so the
                // tie goes to verifiable randomness instead.
                break_tie(&randomness, b, f, incumbent as usize)
            };

            if challenger_wins {
                ms.hold[b] = f as u8;
                pairs[f] = b as u8;
                pairs[incumbent as usize] = NONE;
            }
        }

        write_account(&match_state_info, &ms)?;

        let round = &mut ctx.accounts.round;
        round.pairs = pairs;
        round.tick = round.tick.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

        // A tick where nobody could propose is the fixed point: every founder
        // is either held or has exhausted their list. The matching is stable.
        if proposals == 0 {
            round.status = RoundStatus::Settled;
            emit!(RoundSettled {
                round: round_key,
                ticks: round.tick,
                pairs,
            });
        } else {
            emit!(TickAdvanced {
                round: round_key,
                tick: round.tick,
                proposals,
                pairs,
            });
        }
        Ok(())
    }
}

// ------------------------------------------------------------- helpers ---

fn permission_member(pubkey: Pubkey) -> Member {
    Member {
        flags: AUTHORITY_FLAG | TX_LOGS_FLAG | TX_MESSAGE_FLAG | TX_BALANCES_FLAG,
        pubkey,
    }
}

/// Deterministic, reproducible tie-break from the round's VRF output. Anyone
/// with the published randomness can replay every tie-break in the round
/// without learning a single preference.
fn break_tie(randomness: &[u8; 32], builder: usize, challenger: usize, incumbent: usize) -> bool {
    let a = randomness[(builder * 3 + challenger) % 32];
    let b = randomness[(builder * 3 + incumbent) % 32];
    if a == b {
        challenger < incumbent
    } else {
        a > b
    }
}

/// Signer seeds for the round PDA, which sponsors every ephemeral account and
/// permission in the rollup.
struct RoundSeeds {
    authority: Pubkey,
    round_id: [u8; 8],
    bump: [u8; 1],
}

impl RoundSeeds {
    fn as_slice_refs(&self) -> [&[u8]; 4] {
        [
            ROUND_SEED,
            self.authority.as_ref(),
            &self.round_id,
            &self.bump,
        ]
    }
}

fn round_signer_seeds(round: &Account<'_, Round>) -> RoundSeeds {
    RoundSeeds {
        authority: round.authority,
        round_id: round.round_id.to_le_bytes(),
        bump: [round.bump],
    }
}

fn read_account<T: AccountDeserialize>(info: &AccountInfo) -> Result<T> {
    let data = info.try_borrow_data()?;
    let mut cursor: &[u8] = &data;
    T::try_deserialize(&mut cursor)
}

fn write_account<T: AccountSerialize>(info: &AccountInfo, value: &T) -> Result<()> {
    let mut data = info.try_borrow_mut_data()?;
    value.try_serialize(&mut &mut data[..])?;
    Ok(())
}

// -------------------------------------------------------------- events ---

#[event]
pub struct RoundOpened {
    pub round: Pubkey,
    pub round_id: u64,
    pub deadline_ts: i64,
}

#[event]
pub struct ParticipantJoined {
    pub round: Pubkey,
    pub wallet: Pubkey,
    pub side: Side,
    pub index: u8,
}

#[event]
pub struct RankingSubmitted {
    pub round: Pubkey,
    pub side: Side,
    pub index: u8,
    pub revision: bool,
}

#[event]
pub struct RoundClosed {
    pub round: Pubkey,
    pub founder_count: u8,
    pub builder_count: u8,
}

#[event]
pub struct MatchingStarted {
    pub round: Pubkey,
    pub sealed_count: u8,
}

/// The frame the UI animates on.
#[event]
pub struct TickAdvanced {
    pub round: Pubkey,
    pub tick: u16,
    pub proposals: u8,
    pub pairs: [u8; MAX_PER_SIDE],
}

#[event]
pub struct RoundSettled {
    pub round: Pubkey,
    pub ticks: u16,
    pub pairs: [u8; MAX_PER_SIDE],
}

// ------------------------------------------------------------ accounts ---

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct InitRound<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Round::LEN,
        seeds = [ROUND_SEED, authority.key().as_ref(), &round_id.to_le_bytes()],
        bump
    )]
    pub round: Account<'info, Round>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct JoinRound<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(
        mut,
        seeds = [ROUND_SEED, round.authority.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    #[account(
        init,
        payer = wallet,
        space = 8 + Participant::LEN,
        seeds = [PARTICIPANT_SEED, round.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub participant: Account<'info, Participant>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct DelegateRound<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        del,
        seeds = [ROUND_SEED, authority.key().as_ref(), &round_id.to_le_bytes()],
        bump
    )]
    /// CHECK: Deserialized by the rollup instructions after delegation.
    pub round: UncheckedAccount<'info>,
    /// CHECK: Checked by the delegation program.
    pub validator: Option<UncheckedAccount<'info>>,
}

#[ephemeral_accounts]
#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct InitMatchState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        sponsor,
        seeds = [ROUND_SEED, round.authority.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    /// CHECK: Ephemeral PDA sponsored by the round, written manually.
    #[account(
        mut,
        eph,
        seeds = [MATCH_STATE_SEED, round.key().as_ref()],
        bump
    )]
    pub match_state: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Verified by the Permission Program.
    pub match_state_permission: UncheckedAccount<'info>,
    #[account(address = PERMISSION_PROGRAM_ID)]
    /// CHECK: Fixed Permission Program id.
    pub permission_program: UncheckedAccount<'info>,
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    /// CHECK: Verified by the Magic Program.
    pub ephemeral_vault: UncheckedAccount<'info>,
    #[account(address = MAGIC_PROGRAM_ID)]
    /// CHECK: Fixed Magic Program id.
    pub magic_program: UncheckedAccount<'info>,
}

#[ephemeral_accounts]
#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct SubmitRanking<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(
        mut,
        sponsor,
        seeds = [ROUND_SEED, round.authority.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    #[account(
        seeds = [PARTICIPANT_SEED, round.key().as_ref(), wallet.key().as_ref()],
        bump = participant.bump
    )]
    pub participant: Account<'info, Participant>,
    /// CHECK: Ephemeral PDA sponsored by the round, written manually.
    #[account(
        mut,
        eph,
        seeds = [PREFERENCES_SEED, round.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub preferences: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Verified by the Permission Program.
    pub preferences_permission: UncheckedAccount<'info>,
    #[account(address = PERMISSION_PROGRAM_ID)]
    /// CHECK: Fixed Permission Program id.
    pub permission_program: UncheckedAccount<'info>,
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    /// CHECK: Verified by the Magic Program.
    pub ephemeral_vault: UncheckedAccount<'info>,
    #[account(address = MAGIC_PROGRAM_ID)]
    /// CHECK: Fixed Magic Program id.
    pub magic_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct CloseRound<'info> {
    #[account(
        mut,
        seeds = [ROUND_SEED, round.authority.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct SealPreferences<'info> {
    #[account(
        mut,
        seeds = [ROUND_SEED, round.authority.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    /// CHECK: Private ephemeral PDA, read and written manually.
    #[account(
        mut,
        seeds = [MATCH_STATE_SEED, round.key().as_ref()],
        bump
    )]
    pub match_state: UncheckedAccount<'info>,
    // remaining_accounts: the Preferences accounts to ingest this call.
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct Tick<'info> {
    #[account(
        mut,
        seeds = [ROUND_SEED, round.authority.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    /// CHECK: Private ephemeral PDA, read and written manually.
    #[account(
        mut,
        seeds = [MATCH_STATE_SEED, round.key().as_ref()],
        bump
    )]
    pub match_state: UncheckedAccount<'info>,
}
