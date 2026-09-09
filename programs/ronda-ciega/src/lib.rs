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
        instructions::{CloseEphemeralPermissionCpi, CreateEphemeralPermissionCpi},
        structs::{
            EphemeralMembersArgs, EphemeralPermission, Member, AUTHORITY_FLAG, TX_BALANCES_FLAG,
            TX_LOGS_FLAG, TX_MESSAGE_FLAG,
        },
    },
    anchor::{commit, delegate, ephemeral, ephemeral_accounts, vrf, vrf_callback},
    consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID},
    cpi::DelegateConfig,
    ephem::MagicIntentBundleBuilder,
    vrf::{
        instructions::{create_request_scoped_randomness_ix, RequestRandomnessParams},
        types::SerializableAccountMeta,
    },
};

use session_keys::SessionToken;

mod error;
mod state;

use error::ErrorCode;
use state::{
    Escrow, EscrowState, MatchState, Participant, Preferences, Round, RoundStatus, Side,
    MAX_HANDLE_LEN, MAX_HISTORY, MAX_LINK_LEN, MAX_PER_SIDE, NONE, UNRANKED,
};

declare_id!("5VBYCgdVwAELHuCwQgTXDB7czV9wvz65gYN3bCR9Nq9R");

pub const ROUND_SEED: &[u8] = b"round";
pub const PARTICIPANT_SEED: &[u8] = b"participant";
pub const PREFERENCES_SEED: &[u8] = b"preferences";
pub const MATCH_STATE_SEED: &[u8] = b"match_state";
pub const ESCROW_SEED: &[u8] = b"escrow";

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
    /// `transparent` makes the round publish every intermediate state of the
    /// matching so it can be watched running. Read the field's doc comment
    /// before setting it: watching the algorithm means watching who proposed to
    /// whom in what order, which reconstructs much of everyone's ranking. It is
    /// for demo rounds. A round with real people leaves it false and publishes
    /// only the final pairings.
    pub fn init_round(
        ctx: Context<InitRound>,
        round_id: u64,
        deadline_ts: i64,
        min_per_side: u8,
        transparent: bool,
    ) -> Result<()> {
        require!(
            deadline_ts > Clock::get()?.unix_timestamp,
            ErrorCode::DeadlineInPast
        );
        require!(min_per_side >= 2, ErrorCode::NotEnoughParticipants);

        let prefund = ephemeral_rollups_sdk::ephemeral_accounts::rent((8 + MatchState::LEN) as u32)
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
        round.transparent = transparent;
        round.history = [[NONE; MAX_PER_SIDE]; MAX_HISTORY];
        round.history_len = 0;
        round.total_proposals = 0;
        round.settled_ts = 0;
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

        let prefund =
            ephemeral_rollups_sdk::ephemeral_accounts::rent((8 + Preferences::LEN) as u32)
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

        // Who is entitled to write this list.
        //
        // `wallet` stopped being a signer so that a session key can stand in
        // for it, which makes this check the only thing between a ranking and
        // anyone who would like to write one. Without a token the signer must
        // BE the owner, exactly as before; with one, the token must name this
        // program, this owner and this signer, and must not have expired.
        //
        // Note what a session key still cannot do. Every account here is
        // seeded from `wallet`, and the permission on a Preferences account
        // lists the owner and the round — derived from the seeding key, never
        // from the signer. A session key can write a list. It can never read
        // one back, and that asymmetry is what makes this safe to do at all.
        let owner = ctx.accounts.wallet.key();
        match &ctx.accounts.session_token {
            None => require_keys_eq!(ctx.accounts.signer.key(), owner, ErrorCode::InvalidSession),
            Some(token) => {
                require_keys_eq!(token.authority, owner, ErrorCode::InvalidSession);
                require_keys_eq!(token.target_program, crate::ID, ErrorCode::InvalidSession);
                require_keys_eq!(
                    token.session_signer,
                    ctx.accounts.signer.key(),
                    ErrorCode::InvalidSession
                );
                require!(
                    Clock::get()?.unix_timestamp < token.valid_until,
                    ErrorCode::InvalidSession
                );
            }
        }

        // A ranking may be shorter than the other side (you are allowed to
        // simply not want most people) but never longer, never empty, and never
        // repeat someone.
        let opposite_count = match ctx.accounts.participant.side {
            Side::Founder => ctx.accounts.round.builder_count,
            Side::Builder => ctx.accounts.round.founder_count,
        };
        validate_ranking(&ranking, opposite_count)?;

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
                    members: vec![permission_member(wallet_key), permission_member(round_key)],
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
        check_closable(
            round.status,
            Clock::get()?.unix_timestamp,
            round.deadline_ts,
            round.founder_count,
            round.builder_count,
            round.min_per_side,
        )?;

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
        require_keys_eq!(
            *match_state_info.owner,
            crate::ID,
            ErrorCode::InvalidPreferencesAccount
        );
        let mut ms: MatchState = read_account(&match_state_info)?;
        let mut ingested: u8 = 0;

        for info in ctx.remaining_accounts.iter() {
            // `remaining_accounts` carries no Anchor constraints, so everything
            // about these has to be checked by hand. Deserializing only proves
            // the first eight bytes match a discriminator, which anyone can
            // write into an account they own.
            require_keys_eq!(*info.owner, crate::ID, ErrorCode::InvalidPreferencesAccount);

            let prefs: Preferences = read_account(info)?;
            require_keys_eq!(prefs.round, round_key, ErrorCode::WrongRound);

            // Bind the contents to the address. Without this, a caller could
            // hand over an account holding a fabricated `index` and `side` and
            // overwrite somebody else's ranking in the working memory. The
            // stored bump makes this one hash instead of a 255-step search.
            let expected = Pubkey::create_program_address(
                &[
                    PREFERENCES_SEED,
                    round_key.as_ref(),
                    prefs.owner.as_ref(),
                    &[prefs.bump],
                ],
                &crate::ID,
            )
            .map_err(|_| error!(ErrorCode::InvalidPreferencesAccount))?;
            require_keys_eq!(info.key(), expected, ErrorCode::InvalidPreferencesAccount);

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

    /// One proposal round of Gale–Shapley, as its own transaction.
    ///
    /// Each still-unmatched founder proposes to the next builder on their list.
    /// A builder holding nobody accepts. A builder already holding someone keeps
    /// whichever of the two they rank higher and releases the other, who will
    /// propose again on the next tick.
    ///
    /// This is the step-through mode — useful for inspecting the algorithm one
    /// frame at a time, but note that from a remote client the wall-clock cost
    /// per tick is network round-trip, not rollup execution. `run_matching` is
    /// what actually demonstrates the rollup's speed.
    pub fn tick(ctx: Context<Tick>, round_id: u64) -> Result<()> {
        require_eq!(ctx.accounts.round.round_id, round_id);
        require!(
            ctx.accounts.round.status == RoundStatus::Matching,
            ErrorCode::WrongRoundStatus
        );

        require!(
            ctx.accounts.round.randomness_fulfilled,
            ErrorCode::RandomnessMissing
        );

        let round_key = ctx.accounts.round.key();
        let match_state_info = ctx.accounts.match_state.to_account_info();
        let mut ms: MatchState = read_account(&match_state_info)?;

        let founder_count = ctx.accounts.round.founder_count as usize;
        let mut pairs = ctx.accounts.round.pairs;
        let randomness = ctx.accounts.round.randomness;

        let proposals = advance_one_round(&mut ms, &mut pairs, founder_count, &randomness);

        write_account(&match_state_info, &ms)?;

        let round = &mut ctx.accounts.round;
        round.pairs = pairs;
        round.tick = round.tick.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
        round.total_proposals = round
            .total_proposals
            .checked_add(proposals as u32)
            .ok_or(ErrorCode::MathOverflow)?;

        // A tick where nobody could propose is the fixed point: every founder
        // is either held or has exhausted their list. The matching is stable.
        if proposals == 0 {
            round.status = RoundStatus::Settled;
            round.settled_ts = Clock::get()?.unix_timestamp;
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

    /// Destroy one participant's ranking.
    ///
    /// The README says these accounts are closed inside the rollup and never
    /// committed. Until now only the second half of that was true — nothing
    /// actually closed them, they simply sat in the rollup. This is the
    /// instruction that makes the claim true: the permission is closed, the
    /// account is closed, and the rent goes back to the round that sponsored
    /// it. Nothing is written to L1 at any point.
    ///
    /// Permissionless on purpose. Anyone may clean up a settled round, and
    /// there is nothing to gain by it: the data is unreadable to the caller
    /// either way, and destroying it is what the participant was promised.
    pub fn close_preferences(ctx: Context<ClosePreferences>, round_id: u64) -> Result<()> {
        require_eq!(ctx.accounts.round.round_id, round_id);
        require!(
            ctx.accounts.round.status == RoundStatus::Settled,
            ErrorCode::WrongRoundStatus
        );
        require!(
            !ctx.accounts.preferences.data_is_empty(),
            ErrorCode::AlreadyClosed
        );

        // Bind the data to its address before touching it, for the same reason
        // `seal_preferences` does: `remaining_accounts` and unchecked accounts
        // carry no Anchor constraints.
        let prefs: Preferences = read_account(&ctx.accounts.preferences.to_account_info())?;
        let round_key = ctx.accounts.round.key();
        require_keys_eq!(prefs.round, round_key, ErrorCode::WrongRound);
        require_keys_eq!(
            prefs.owner,
            ctx.accounts.owner.key(),
            ErrorCode::InvalidPreferencesAccount
        );

        let round_seeds = round_signer_seeds(&ctx.accounts.round);
        let prefs_bump = [prefs.bump];
        let owner_key = ctx.accounts.owner.key();
        let prefs_signers: &[&[u8]] = &[
            PREFERENCES_SEED,
            round_key.as_ref(),
            owner_key.as_ref(),
            &prefs_bump,
        ];

        CloseEphemeralPermissionCpi {
            payer: ctx.accounts.round.to_account_info(),
            authority: ctx.accounts.preferences.to_account_info(),
            permissioned_account: ctx.accounts.preferences.to_account_info(),
            permission: ctx.accounts.preferences_permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            authority_is_signer: false,
        }
        .invoke_signed(&[&round_seeds.as_slice_refs(), prefs_signers])?;

        ctx.accounts.close_ephemeral_preferences()?;

        emit!(PreferencesClosed {
            round: round_key,
            owner: owner_key,
        });
        Ok(())
    }

    /// Destroy the algorithm's working memory, which held every ranking in the
    /// round. Same reasoning as `close_preferences`, and it should be the last
    /// thing closed: while it exists the round can still be re-run.
    pub fn close_match_state(ctx: Context<CloseMatchState>, round_id: u64) -> Result<()> {
        require_eq!(ctx.accounts.round.round_id, round_id);
        require!(
            ctx.accounts.round.status == RoundStatus::Settled,
            ErrorCode::WrongRoundStatus
        );
        require!(
            !ctx.accounts.match_state.data_is_empty(),
            ErrorCode::AlreadyClosed
        );

        let round_key = ctx.accounts.round.key();
        let ms: MatchState = read_account(&ctx.accounts.match_state.to_account_info())?;
        require_keys_eq!(ms.round, round_key, ErrorCode::WrongRound);

        let round_seeds = round_signer_seeds(&ctx.accounts.round);
        let ms_bump = [ms.bump];
        let ms_signers: &[&[u8]] = &[MATCH_STATE_SEED, round_key.as_ref(), &ms_bump];

        CloseEphemeralPermissionCpi {
            payer: ctx.accounts.round.to_account_info(),
            authority: ctx.accounts.match_state.to_account_info(),
            permissioned_account: ctx.accounts.match_state.to_account_info(),
            permission: ctx.accounts.match_state_permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            authority_is_signer: false,
        }
        .invoke_signed(&[&round_seeds.as_slice_refs(), ms_signers])?;

        ctx.accounts.close_ephemeral_match_state()?;

        emit!(MatchStateClosed { round: round_key });
        Ok(())
    }

    /// Ask the oracle for the round's tie-break randomness.
    ///
    /// Requested on the rollup, against the ephemeral queue, because that is
    /// where the round lives once delegated. Matching refuses to run until the
    /// callback lands: a tie resolved by account index would quietly reward
    /// whoever registered first, which is exactly the bias this exists to
    /// remove. See `break_tie`.
    pub fn request_round_randomness(
        ctx: Context<RequestRoundRandomness>,
        round_id: u64,
    ) -> Result<()> {
        require_eq!(ctx.accounts.round.round_id, round_id);
        require!(
            !ctx.accounts.round.randomness_fulfilled,
            ErrorCode::RandomnessAlreadyFulfilled
        );

        let ix = create_request_scoped_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: ID,
            callback_discriminator: instruction::RoundRandomnessCallback::DISCRIMINATOR.to_vec(),
            caller_seed: ctx.accounts.round.key().to_bytes(),
            accounts_metas: Some(vec![SerializableAccountMeta {
                pubkey: ctx.accounts.round.key(),
                is_signer: false,
                is_writable: true,
            }]),
            ..Default::default()
        });
        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;

        msg!(
            "Randomness requested for round {}",
            ctx.accounts.round.key()
        );
        Ok(())
    }

    /// Oracle callback. The seed is published on the round so anyone can replay
    /// every tie-break without seeing a single preference.
    pub fn round_randomness_callback(
        ctx: Context<RoundRandomnessCallbackCtx>,
        randomness: [u8; 32],
    ) -> Result<()> {
        let round = &mut ctx.accounts.round;

        // First answer wins. `request_round_randomness` only refuses once a
        // seed is already stored, so two requests can both be in flight before
        // either callback lands — and without this the second one overwrites
        // the seed the round was matched with. The pairs would not change,
        // having already been computed, but the round would then publish a
        // seed that does not reproduce them, which is the one thing a
        // verifiable tie-break cannot afford.
        require!(
            !round.randomness_fulfilled,
            ErrorCode::RandomnessAlreadyFulfilled
        );

        round.randomness = randomness;
        round.randomness_fulfilled = true;

        emit!(RandomnessFulfilled {
            round: round.key(),
            randomness,
        });
        Ok(())
    }

    /// Commit the round back to L1 and end its life on the rollup.
    ///
    /// Only `Round` is committed. `Preferences` and `MatchState` are ephemeral
    /// accounts that were never delegated from L1 and are never committed to
    /// it — there is no code path that moves a ranking out of the enclave.
    pub fn undelegate_round(ctx: Context<UndelegateRound>, round_id: u64) -> Result<()> {
        require_eq!(ctx.accounts.round.round_id, round_id);
        require!(
            ctx.accounts.round.status == RoundStatus::Settled,
            ErrorCode::WrongRoundStatus
        );

        let round_key = ctx.accounts.round.key();

        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.round.to_account_info()])
        .build_and_invoke()?;

        msg!("Round {} committed back to L1", round_key);
        Ok(())
    }

    /// Run the matching to completion inside a single rollup transaction.
    ///
    /// This is the instruction that actually shows what the rollup can do. The
    /// per-tick loop still runs, and still emits one `TickAdvanced` event per
    /// proposal round — the frontend replays those events as the animation —
    /// but all of it executes in one block instead of paying an internet
    /// round-trip per frame. A remote client cannot make N sequential
    /// transactions fast; it can make one transaction that does N rounds.
    ///
    /// `max_ticks` bounds the loop so the instruction can never run away. The
    /// theoretical worst case for Gale–Shapley is n² proposals, so a caller
    /// that passes fewer can simply call again — the state is resumable.
    pub fn run_matching(ctx: Context<Tick>, round_id: u64, max_ticks: u8) -> Result<()> {
        require_eq!(ctx.accounts.round.round_id, round_id);
        require!(
            ctx.accounts.round.status == RoundStatus::Matching,
            ErrorCode::WrongRoundStatus
        );
        require!(max_ticks > 0, ErrorCode::InvalidTickBudget);
        // No matching without verifiable randomness: ties would otherwise fall
        // to registration order.
        require!(
            ctx.accounts.round.randomness_fulfilled,
            ErrorCode::RandomnessMissing
        );

        let round_key = ctx.accounts.round.key();
        let match_state_info = ctx.accounts.match_state.to_account_info();
        let mut ms: MatchState = read_account(&match_state_info)?;

        let founder_count = ctx.accounts.round.founder_count as usize;
        let mut pairs = ctx.accounts.round.pairs;
        let randomness = ctx.accounts.round.randomness;
        let mut tick_no = ctx.accounts.round.tick;
        let transparent = ctx.accounts.round.transparent;
        let mut history = ctx.accounts.round.history;
        let mut history_len = ctx.accounts.round.history_len as usize;
        let mut settled = false;

        let mut total = ctx.accounts.round.total_proposals;

        for _ in 0..max_ticks {
            let step = advance_matching(AdvanceInput {
                ms: &mut ms,
                pairs: &mut pairs,
                founder_count,
                randomness: &randomness,
                transparent,
                tick_no,
                total,
                history: &mut history,
                history_len,
            })?;

            tick_no = step.tick_no;
            total = step.total;
            history_len = step.history_len;

            if step.settled {
                settled = true;
                break;
            }

            emit!(TickAdvanced {
                round: round_key,
                tick: tick_no,
                proposals: step.proposals,
                pairs,
            });
        }

        write_account(&match_state_info, &ms)?;

        let round = &mut ctx.accounts.round;
        round.pairs = pairs;
        round.tick = tick_no;
        round.total_proposals = total;
        if transparent {
            round.history = history;
            round.history_len = history_len as u8;
        }
        if settled {
            round.status = RoundStatus::Settled;
            round.settled_ts = Clock::get()?.unix_timestamp;
            emit!(RoundSettled {
                round: round_key,
                ticks: tick_no,
                pairs,
            });
        }
        Ok(())
    }

    // ------------------------------------------------------------ escrow ---
    //
    // Where the private part stops and the public part starts.
    //
    // The enclave decides who is paired with whom and destroys the lists that
    // decided it. None of that moves money: the funds sit on L1 the entire
    // time, in an account this program owns, and the only thing the matching
    // does to them is name a recipient. That split is the whole design. Money
    // inside the enclave would put custody behind the same trust boundary the
    // privacy argument leans on, and then "the enclave cannot be audited"
    // stops being a fair trade and starts being a hole.
    //
    // So: `deposit_escrow` locks, `settle_pair` pays whoever the matching
    // chose, `refund_escrow` returns what was never paired. Every one of them
    // reads `round.pairs`, which is public, and none of them can see a list.

    /// Lock lamports against a round, before it closes.
    ///
    /// Only while the round is open: a deposit that arrives after the lists
    /// are sealed is money committed to a matching whose inputs are already
    /// fixed, which is a different and worse game than everyone else played.
    pub fn deposit_escrow(ctx: Context<DepositEscrow>, round_id: u64, amount: u64) -> Result<()> {
        require_eq!(ctx.accounts.round.round_id, round_id);
        require!(
            ctx.accounts.round.status == RoundStatus::Open,
            ErrorCode::RoundClosed
        );
        require!(
            Clock::get()?.unix_timestamp < ctx.accounts.round.deadline_ts,
            ErrorCode::RoundClosed
        );
        require!(amount > 0, ErrorCode::NothingToEscrow);

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.wallet.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            amount,
        )?;

        let round_key = ctx.accounts.round.key();
        let wallet_key = ctx.accounts.wallet.key();
        let escrow = &mut ctx.accounts.escrow;
        escrow.round = round_key;
        escrow.wallet = wallet_key;
        // Adding rather than assigning: topping up an existing lock is a
        // second deposit, not a correction of the first.
        escrow.amount = escrow
            .amount
            .checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        escrow.state = EscrowState::Locked;
        escrow.bump = ctx.bumps.escrow;

        emit!(EscrowFunded {
            round: round_key,
            wallet: wallet_key,
            amount: escrow.amount,
        });
        Ok(())
    }

    /// Pay one escrow to the counterparty the matching chose.
    ///
    /// Takes no signer, like `close_round` and `tick`: a payment only the
    /// round's author can trigger is a payment that depends on them still
    /// caring. What it does check is everything that makes the payment
    /// correct — the round settled, both participants belong to it, the
    /// pairing names exactly these two, and the account being paid is the
    /// wallet that participant registered with.
    pub fn settle_pair(ctx: Context<SettlePair>, round_id: u64) -> Result<()> {
        let round = &ctx.accounts.round;
        require_eq!(round.round_id, round_id);
        require!(
            round.status == RoundStatus::Settled,
            ErrorCode::NotSettledYet
        );

        let payer = &ctx.accounts.payer_participant;
        let payee = &ctx.accounts.payee_participant;

        // Identity first: that these accounts are who they claim to be is a
        // question about accounts, and stays here. Whether the payment is
        // legal is a question about values, and lives in check_settle.
        require_keys_eq!(payer.round, round.key(), ErrorCode::WrongRound);
        require_keys_eq!(payee.round, round.key(), ErrorCode::WrongRound);
        require_keys_eq!(
            ctx.accounts.escrow.wallet,
            payer.wallet,
            ErrorCode::WrongRound
        );
        require_keys_eq!(
            ctx.accounts.payee_wallet.key(),
            payee.wallet,
            ErrorCode::WrongRound
        );

        check_settle(
            round.status,
            payer.side,
            payee.side,
            payer.index,
            payee.index,
            &round.pairs,
            ctx.accounts.escrow.state,
        )?;

        let amount = ctx.accounts.escrow.amount;
        let round_key = round.key();
        let from = payer.wallet;
        let to = payee.wallet;

        // Lamports move by direct arithmetic: a system-program transfer needs
        // a system account on the sending side, and this one carries data. The
        // rent is deliberately left behind for `close` to return to the
        // depositor, because rent was never part of what was offered.
        let escrow_info = ctx.accounts.escrow.to_account_info();
        let payee_info = ctx.accounts.payee_wallet.to_account_info();
        let taken = escrow_info
            .lamports()
            .checked_sub(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        let given = payee_info
            .lamports()
            .checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        **escrow_info.try_borrow_mut_lamports()? = taken;
        **payee_info.try_borrow_mut_lamports()? = given;

        let escrow = &mut ctx.accounts.escrow;
        escrow.amount = 0;
        escrow.state = EscrowState::Settled;

        emit!(EscrowSettled {
            round: round_key,
            from,
            to,
            amount,
        });
        Ok(())
    }

    /// Return a deposit that was never paid out.
    ///
    /// Two ways to qualify, both checkable by anyone without asking: the round
    /// settled and left this person unmatched, or the deadline passed and the
    /// round never settled at all. The second is the one that matters — it
    /// means money cannot be stranded by an operator who walks away.
    pub fn refund_escrow(ctx: Context<RefundEscrow>, round_id: u64) -> Result<()> {
        let round = &ctx.accounts.round;
        require_eq!(round.round_id, round_id);
        require_keys_eq!(
            ctx.accounts.escrow.wallet,
            ctx.accounts.wallet.key(),
            ErrorCode::WrongRound
        );

        let participant = &ctx.accounts.participant;
        require_keys_eq!(participant.round, round.key(), ErrorCode::WrongRound);
        require_keys_eq!(
            participant.wallet,
            ctx.accounts.wallet.key(),
            ErrorCode::WrongRound
        );

        check_refund(
            round.status,
            round.deadline_ts,
            Clock::get()?.unix_timestamp,
            participant.side,
            participant.index,
            &round.pairs,
            ctx.accounts.escrow.state,
        )?;

        let round_key = round.key();
        let wallet_key = ctx.accounts.wallet.key();
        let amount = ctx.accounts.escrow.amount;
        let escrow = &mut ctx.accounts.escrow;
        escrow.amount = 0;
        escrow.state = EscrowState::Refunded;

        emit!(EscrowRefunded {
            round: round_key,
            wallet: wallet_key,
            amount,
        });
        Ok(())
    }
}


// ------------------------------------------------------------- helpers ---

/// Is this payout legal?
///
/// Pulled out of the handler for the same reason `check_closable` was: the
/// rule decides where money goes, and a rule that can only be exercised
/// against a validator is a rule that gets exercised once, by hand, on the
/// happy path. Everything it needs is a value, so everything it does can be
/// tested — including the six ways it has to say no.
///
/// Deliberately takes `pairs` rather than the whole `Round`: the pairing is
/// the only thing the enclave contributed and the only thing this decision is
/// allowed to depend on.
#[allow(clippy::too_many_arguments)]
fn check_settle(
    status: RoundStatus,
    payer_side: Side,
    payee_side: Side,
    payer_index: u8,
    payee_index: u8,
    pairs: &[u8; MAX_PER_SIDE],
    escrow_state: EscrowState,
) -> Result<()> {
    require!(status == RoundStatus::Settled, ErrorCode::NotSettledYet);
    require!(payer_side == Side::Founder, ErrorCode::WrongSide);
    require!(payee_side == Side::Builder, ErrorCode::WrongSide);
    require!(
        escrow_state == EscrowState::Locked,
        ErrorCode::EscrowAlreadyDone
    );

    let paired = *pairs
        .get(payer_index as usize)
        .ok_or(ErrorCode::NoSuchParticipant)?;
    require!(paired != NONE, ErrorCode::WentUnmatched);
    require_eq!(paired, payee_index, ErrorCode::NotYourPair);
    Ok(())
}

/// Is this refund legal?
///
/// Two doors, and the second is the one that makes the whole thing safe to
/// put money into: a round that never settled releases every deposit once its
/// deadline has passed. Nobody has to still be around, and nobody has to
/// agree. Without that, an operator who loses interest half way through a
/// round is an operator holding other people's money indefinitely.
fn check_refund(
    status: RoundStatus,
    deadline_ts: i64,
    now: i64,
    side: Side,
    index: u8,
    pairs: &[u8; MAX_PER_SIDE],
    escrow_state: EscrowState,
) -> Result<()> {
    require!(
        escrow_state == EscrowState::Locked,
        ErrorCode::EscrowAlreadyDone
    );

    if status != RoundStatus::Settled {
        // Abandoned: past the deadline with no result.
        require!(now >= deadline_ts, ErrorCode::NothingToRefund);
        return Ok(());
    }

    // Settled: only the people it left out.
    let unmatched = match side {
        Side::Founder => {
            *pairs
                .get(index as usize)
                .ok_or(ErrorCode::NoSuchParticipant)?
                == NONE
        }
        // A builder never deposits, so a builder escrow is already an anomaly.
        // Returning it is the only safe thing to do with one.
        Side::Builder => true,
    };
    require!(unmatched, ErrorCode::NothingToRefund);
    Ok(())
}


fn permission_member(pubkey: Pubkey) -> Member {
    Member {
        flags: AUTHORITY_FLAG | TX_LOGS_FLAG | TX_MESSAGE_FLAG | TX_BALANCES_FLAG,
        pubkey,
    }
}

/// One proposal round, shared by `tick` and `run_matching` so the step-through
/// mode and the single-transaction mode can never drift apart. Returns how many
/// proposals were made; zero means the matching has reached its fixed point.
fn advance_one_round(
    ms: &mut MatchState,
    pairs: &mut [u8; MAX_PER_SIDE],
    founder_count: usize,
    randomness: &[u8; 32],
) -> u8 {
    let mut proposals: u8 = 0;

    for f in 0..founder_count {
        // Already tentatively held by someone: nothing to do this round.
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
            // order would hand the slot to whoever registered first, so the tie
            // goes to verifiable randomness instead.
            break_tie(randomness, b, f, incumbent as usize)
        };

        if challenger_wins {
            ms.hold[b] = f as u8;
            pairs[f] = b as u8;
            pairs[incumbent as usize] = NONE;
        }
    }

    proposals
}

/// Everything that has to be true before a round can close.
///
/// Lifted out of `close_round` so it can be tested on the host, and because
/// the interface has to make the same decision to know whether to offer the
/// button. It got that wrong once already: the quorum was read as a total
/// rather than per side, so "close and match" sat there live on a round with
/// six founders and no builders — a control offering the one thing the program
/// is guaranteed to refuse.
///
/// The order of the three is deliberate and worth keeping. A round already
/// past Open reports the status, not the deadline, because the deadline is no
/// longer the interesting fact about it.
fn check_closable(
    status: RoundStatus,
    now: i64,
    deadline_ts: i64,
    founder_count: u8,
    builder_count: u8,
    min_per_side: u8,
) -> Result<()> {
    require!(status == RoundStatus::Open, ErrorCode::WrongRoundStatus);
    require!(now >= deadline_ts, ErrorCode::RoundStillOpen);
    // Both sides, never the sum. Twelve people all on one side is not a market.
    require!(
        founder_count >= min_per_side && builder_count >= min_per_side,
        ErrorCode::NotEnoughParticipants
    );
    Ok(())
}

/// Borrowed state for one step of the matching loop.
struct AdvanceInput<'a> {
    ms: &'a mut MatchState,
    pairs: &'a mut [u8; MAX_PER_SIDE],
    founder_count: usize,
    randomness: &'a [u8; 32],
    transparent: bool,
    tick_no: u16,
    total: u32,
    history: &'a mut [[u8; MAX_PER_SIDE]; MAX_HISTORY],
    history_len: usize,
}

/// What one step of the matching loop produced.
struct AdvanceOutput {
    tick_no: u16,
    total: u32,
    history_len: usize,
    proposals: u8,
    /// No proposals were made: the matching has reached its fixed point.
    settled: bool,
}

/// One step of the matching loop: advance a round, count it, and record the
/// frame if — and only if — the round is transparent.
///
/// Lifted out of `run_matching` so the recording rule can be asserted on the
/// host. That rule is the privacy claim living inside the loop: on a private
/// round the intermediate states never leave the enclave, because the order of
/// proposals is itself preference data — if round one shows that founder 0
/// proposed to builder 2, that publishes founder 0's first choice. Nothing
/// checked it. A single misplaced condition here would publish the sequence
/// for every round ever run, and the account would look ordinary.
fn advance_matching(input: AdvanceInput<'_>) -> Result<AdvanceOutput> {
    let AdvanceInput {
        ms,
        pairs,
        founder_count,
        randomness,
        transparent,
        tick_no,
        total,
        history,
        mut history_len,
    } = input;

    let proposals = advance_one_round(ms, pairs, founder_count, randomness);
    let tick_no = tick_no.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
    let total = total
        .checked_add(proposals as u32)
        .ok_or(ErrorCode::MathOverflow)?;

    if proposals == 0 {
        return Ok(AdvanceOutput {
            tick_no,
            total,
            history_len,
            proposals,
            settled: true,
        });
    }

    // Only a transparent round records the frame.
    if transparent && history_len < MAX_HISTORY {
        history[history_len] = *pairs;
        history_len += 1;
    }

    Ok(AdvanceOutput {
        tick_no,
        total,
        history_len,
        proposals,
        settled: false,
    })
}

/// Everything a submitted ranking has to satisfy before it is written.
///
/// Lifted out of `submit_ranking` so it can be tested on the host. These four
/// refusals were only ever exercised by `scripts/negative.ts`, which needs a
/// funded devnet wallet, takes minutes and cannot run in CI — so the rules
/// that decide whether somebody's list is accepted were checked by hand, when
/// somebody remembered, against a cluster that has to be up.
///
/// The behaviour is unchanged: same requires, same error codes, same order.
/// Order matters to the caller — a ranking that is both too long and full of
/// duplicates must still report InvalidRanking, because the length is the
/// thing to fix first.
fn validate_ranking(ranking: &[u8], opposite_count: u8) -> Result<()> {
    // Longer than the other side is impossible, and empty is not a preference
    // — it is a submission that says nothing, which the account should not
    // exist to hold.
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

    Ok(())
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

// ------------------------------------------------------ escrow accounts ---

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct DepositEscrow<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(
        seeds = [ROUND_SEED, round.authority.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    /// Proves the depositor is in this round. Locking money against a market
    /// you have not joined has no meaning, and an escrow with no participant
    /// behind it can never be settled — only refunded, which is a stuck
    /// account nobody asked for.
    #[account(
        seeds = [PARTICIPANT_SEED, round.key().as_ref(), wallet.key().as_ref()],
        bump = participant.bump,
        constraint = participant.wallet == wallet.key() @ ErrorCode::WrongRound,
    )]
    pub participant: Account<'info, Participant>,
    #[account(
        init_if_needed,
        payer = wallet,
        space = 8 + Escrow::LEN,
        seeds = [ESCROW_SEED, round.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct SettlePair<'info> {
    #[account(
        seeds = [ROUND_SEED, round.authority.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    pub payer_participant: Account<'info, Participant>,
    pub payee_participant: Account<'info, Participant>,
    /// The escrow is closed to the depositor, not to whoever sent the
    /// transaction. `settle_pair` needs no signer, so a caller who could keep
    /// the rent would be paid for other people's settlements.
    #[account(
        mut,
        close = payer_wallet,
        seeds = [ESCROW_SEED, round.key().as_ref(), payer_wallet.key().as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
    /// CHECK: matched against `payer_participant.wallet` in the handler, and
    /// pinned by the escrow seeds above.
    #[account(mut)]
    pub payer_wallet: UncheckedAccount<'info>,
    /// CHECK: matched against `payee_participant.wallet` in the handler.
    #[account(mut)]
    pub payee_wallet: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct RefundEscrow<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(
        seeds = [ROUND_SEED, round.authority.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    #[account(
        seeds = [PARTICIPANT_SEED, round.key().as_ref(), wallet.key().as_ref()],
        bump = participant.bump,
    )]
    pub participant: Account<'info, Participant>,
    #[account(
        mut,
        close = wallet,
        seeds = [ESCROW_SEED, round.key().as_ref(), wallet.key().as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
}

// -------------------------------------------------------- escrow events ---

#[event]
pub struct EscrowFunded {
    pub round: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
}

/// The one event that says a private computation moved public money.
#[event]
pub struct EscrowSettled {
    pub round: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EscrowRefunded {
    pub round: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
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
pub struct PreferencesClosed {
    pub round: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct MatchStateClosed {
    pub round: Pubkey,
}

#[event]
pub struct RandomnessFulfilled {
    pub round: Pubkey,
    pub randomness: [u8; 32],
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
    /// Whoever is paying and signing this transaction: either `wallet`
    /// itself, or a session signer holding a token `wallet` issued.
    #[account(mut)]
    pub signer: Signer<'info>,
    /// CHECK: The participant this ranking belongs to. Not a signer, because
    /// a session key may be standing in for it — every account below is
    /// seeded from this key, and the body proves the signer is entitled to
    /// act for it.
    pub wallet: UncheckedAccount<'info>,
    /// A token from the session-keys program authorising `signer` to act for
    /// `wallet`. Absent when the owner signs for themselves.
    pub session_token: Option<Account<'info, SessionToken>>,
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

#[ephemeral_accounts]
#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct ClosePreferences<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Only used to derive the account being closed; its contents are
    /// checked against the stored owner.
    pub owner: UncheckedAccount<'info>,
    #[account(
        mut,
        sponsor,
        seeds = [ROUND_SEED, round.authority.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    /// CHECK: Private ephemeral PDA, read manually before closing.
    #[account(
        mut,
        eph,
        seeds = [PREFERENCES_SEED, round.key().as_ref(), owner.key().as_ref()],
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

#[ephemeral_accounts]
#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct CloseMatchState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        sponsor,
        seeds = [ROUND_SEED, round.authority.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    /// CHECK: Private ephemeral PDA, read manually before closing.
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

#[vrf]
#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct RequestRoundRandomness<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [ROUND_SEED, round.authority.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    /// CHECK: Validated by the ephemeral VRF program when it processes the request.
    #[account(mut)]
    pub oracle_queue: UncheckedAccount<'info>,
}

#[vrf_callback]
#[derive(Accounts)]
pub struct RoundRandomnessCallbackCtx<'info> {
    #[account(mut)]
    pub round: Account<'info, Round>,
}

#[commit]
#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct UndelegateRound<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [ROUND_SEED, round.authority.as_ref(), &round.round_id.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
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

// ---------------------------------------------------------------- tests ---
//
// The program had none. Everything that verified this logic ran against a
// TypeScript reimplementation in the frontend — four hundred generated markets
// per click, well covered — and nothing anywhere checked that the two agree.
// The implementation that decides who actually gets matched is this one, and
// it was the untested one.
//
// So these run the Rust directly. The vector marked SHARED uses the same lists
// the TypeScript suite asserts on, so if the two ever drift one of the two
// suites goes red instead of a devnet round quietly producing a different
// pairing from the page that explains it.
#[cfg(test)]
mod tests {
    use super::*;

    /// A MatchState with no accounts attached: only the fields the algorithm
    /// reads.
    fn state(founder_lists: &[&[u8]], builder_lists: &[&[u8]]) -> MatchState {
        let mut ms = MatchState {
            round: Pubkey::default(),
            founder_ranking: [[NONE; MAX_PER_SIDE]; MAX_PER_SIDE],
            founder_len: [0; MAX_PER_SIDE],
            builder_rank: [[UNRANKED; MAX_PER_SIDE]; MAX_PER_SIDE],
            cursor: [0; MAX_PER_SIDE],
            hold: [NONE; MAX_PER_SIDE],
            bump: 0,
        };

        for (f, list) in founder_lists.iter().enumerate() {
            for (i, b) in list.iter().enumerate() {
                ms.founder_ranking[f][i] = *b;
            }
            ms.founder_len[f] = list.len() as u8;
        }

        // The inverse, exactly as seal_preferences builds it.
        for (b, list) in builder_lists.iter().enumerate() {
            for (position, f) in list.iter().enumerate() {
                ms.builder_rank[b][*f as usize] = position as u8;
            }
        }

        ms
    }

    /// Run to the fixed point and return the pairing, founder-indexed.
    fn settle(founder_lists: &[&[u8]], builder_lists: &[&[u8]], randomness: &[u8; 32]) -> Vec<u8> {
        let mut ms = state(founder_lists, builder_lists);
        let mut pairs = [NONE; MAX_PER_SIDE];
        let n = founder_lists.len();
        for _ in 0..64 {
            if advance_one_round(&mut ms, &mut pairs, n, randomness) == 0 {
                break;
            }
        }
        pairs[..n].to_vec()
    }

    fn flat(v: u8) -> [u8; 32] {
        [v; 32]
    }

    // --------------------------------------------------------- check_closable
    //
    // The rule the interface has to mirror to know whether to offer the
    // button, and it got it wrong once: the quorum was read as a total rather
    // than per side, so "close and match" sat live on a round with six
    // founders and no builders.

    const WRONG_ROUND_STATUS: u32 = 6003;
    const ROUND_STILL_OPEN: u32 = 6002;
    const NOT_ENOUGH_PARTICIPANTS: u32 = 6005;

    fn closable(
        status: RoundStatus,
        now: i64,
        deadline_ts: i64,
        founders: u8,
        builders: u8,
        min_per_side: u8,
    ) -> Option<u32> {
        match check_closable(status, now, deadline_ts, founders, builders, min_per_side) {
            Ok(()) => None,
            Err(Error::AnchorError(inner)) => Some(inner.error_code_number),
            Err(_) => panic!("not an anchor error"),
        }
    }

    #[test]
    fn an_open_round_past_its_deadline_with_quorum_closes() {
        assert_eq!(closable(RoundStatus::Open, 1_000, 1_000, 2, 2, 2), None);
    }

    #[test]
    fn the_deadline_is_inclusive() {
        // The program compares with >=, and the autopilot decides when to send
        // this using the same boundary. An off-by-one here strands a round for
        // a whole poll interval after it became closeable.
        assert_eq!(
            closable(RoundStatus::Open, 999, 1_000, 2, 2, 2),
            Some(ROUND_STILL_OPEN)
        );
        assert_eq!(closable(RoundStatus::Open, 1_000, 1_000, 2, 2, 2), None);
    }

    #[test]
    fn a_round_that_is_not_open_reports_the_status() {
        for status in [
            RoundStatus::Sealing,
            RoundStatus::Matching,
            RoundStatus::Settled,
        ] {
            assert_eq!(
                closable(status, 5_000, 1_000, 8, 8, 2),
                Some(WRONG_ROUND_STATUS)
            );
        }
    }

    #[test]
    fn quorum_is_per_side_and_never_the_total() {
        // The bug this test exists for. Six and nothing is twelve people by
        // one reading and not a market by the only one that counts.
        assert_eq!(
            closable(RoundStatus::Open, 5_000, 1_000, 6, 0, 2),
            Some(NOT_ENOUGH_PARTICIPANTS)
        );
        assert_eq!(
            closable(RoundStatus::Open, 5_000, 1_000, 0, 6, 2),
            Some(NOT_ENOUGH_PARTICIPANTS)
        );
        assert_eq!(closable(RoundStatus::Open, 5_000, 1_000, 2, 2, 2), None);
    }

    #[test]
    fn one_short_on_either_side_is_still_short() {
        assert_eq!(
            closable(RoundStatus::Open, 5_000, 1_000, 2, 1, 2),
            Some(NOT_ENOUGH_PARTICIPANTS)
        );
        assert_eq!(
            closable(RoundStatus::Open, 5_000, 1_000, 1, 2, 2),
            Some(NOT_ENOUGH_PARTICIPANTS)
        );
    }

    #[test]
    fn status_is_reported_before_the_deadline_and_the_deadline_before_quorum() {
        // A round already past Open reports the status, not the deadline: the
        // deadline is no longer the interesting fact about it. And a round
        // still inside its window reports that rather than a headcount that
        // people may yet fix by joining.
        assert_eq!(
            closable(RoundStatus::Sealing, 0, 1_000, 0, 0, 2),
            Some(WRONG_ROUND_STATUS)
        );
        assert_eq!(
            closable(RoundStatus::Open, 0, 1_000, 0, 0, 2),
            Some(ROUND_STILL_OPEN)
        );
    }

    #[test]
    fn a_negative_timestamp_does_not_wrap_into_a_closeable_round() {
        // unix_timestamp is i64 and signed. A clock before the epoch must read
        // as "not yet", not as an enormous positive.
        assert_eq!(
            closable(RoundStatus::Open, -1, 1_000, 2, 2, 2),
            Some(ROUND_STILL_OPEN)
        );
    }

    // ------------------------------------------------------ frame recording
    //
    // The privacy claim that lives inside the matching loop. On a private
    // round the intermediate states must never be written down, because the
    // order of proposals is preference data: if round one shows founder 0
    // proposing to builder 2, that publishes founder 0's first choice, and the
    // full sequence reconstructs much of everyone's list. Nothing checked it.
    // A single misplaced condition would publish that sequence for every round
    // ever run, and the account would look entirely ordinary.

    /// Run the whole matching the way run_matching does and report what got
    /// written to the history.
    fn run_and_record(
        founder_lists: &[&[u8]],
        builder_lists: &[&[u8]],
        randomness: &[u8; 32],
        transparent: bool,
    ) -> (usize, u16, u32) {
        let mut ms = state(founder_lists, builder_lists);
        let mut pairs = [NONE; MAX_PER_SIDE];
        let mut history = [[NONE; MAX_PER_SIDE]; MAX_HISTORY];
        let mut history_len = 0usize;
        let mut tick_no: u16 = 0;
        let mut total: u32 = 0;

        for _ in 0..64u8 {
            let step = advance_matching(AdvanceInput {
                ms: &mut ms,
                pairs: &mut pairs,
                founder_count: founder_lists.len(),
                randomness,
                transparent,
                tick_no,
                total,
                history: &mut history,
                history_len,
            })
            .unwrap();
            tick_no = step.tick_no;
            total = step.total;
            history_len = step.history_len;
            if step.settled {
                break;
            }
        }

        (history_len, tick_no, total)
    }

    /// A market that takes several rounds to settle, so there is a sequence
    /// worth leaking.
    fn multi_round_market() -> (&'static [&'static [u8]], &'static [&'static [u8]]) {
        (
            &[&[0, 1, 2], &[0, 1, 2], &[0, 1, 2]],
            &[&[2, 1, 0], &[2, 1, 0], &[2, 1, 0]],
        )
    }

    #[test]
    fn a_private_round_records_no_frames_at_all() {
        let (f, b) = multi_round_market();
        let (history_len, ticks, _) = run_and_record(f, b, &flat(0), false);
        assert!(ticks > 1, "market settled too fast to be a useful test");
        assert_eq!(
            history_len, 0,
            "a private round wrote {} frames",
            history_len
        );
    }

    #[test]
    fn a_transparent_round_records_one_frame_per_round_that_did_work() {
        let (f, b) = multi_round_market();
        let (history_len, ticks, _) = run_and_record(f, b, &flat(0), true);
        // The final round makes no proposals and is the one that settles, so
        // it is counted as a tick and produces no frame.
        assert_eq!(history_len, ticks as usize - 1);
    }

    #[test]
    fn the_two_modes_reach_the_same_pairing() {
        // Transparency is a disclosure, not a different algorithm. If these
        // ever diverge, the demo round pair that the README asks people to
        // read side by side stops meaning anything.
        let (f, b) = multi_round_market();
        let a = settle(f, b, &flat(0));
        let c = settle(f, b, &flat(0));
        assert_eq!(a, c);

        let (_, ticks_private, total_private) = run_and_record(f, b, &flat(0), false);
        let (_, ticks_public, total_public) = run_and_record(f, b, &flat(0), true);
        assert_eq!(ticks_private, ticks_public);
        assert_eq!(total_private, total_public);
    }

    #[test]
    fn the_history_stops_at_its_capacity_instead_of_overflowing() {
        // MAX_HISTORY frames is all the account holds. A round deeper than
        // that must keep matching and stop recording, not panic.
        let mut ms = state(&[&[0]], &[&[0]]);
        let mut pairs = [NONE; MAX_PER_SIDE];
        let mut history = [[NONE; MAX_PER_SIDE]; MAX_HISTORY];

        let step = advance_matching(AdvanceInput {
            ms: &mut ms,
            pairs: &mut pairs,
            founder_count: 1,
            randomness: &flat(0),
            transparent: true,
            tick_no: 0,
            total: 0,
            history: &mut history,
            history_len: MAX_HISTORY,
        })
        .unwrap();

        assert_eq!(step.history_len, MAX_HISTORY);
    }

    #[test]
    fn a_settling_round_records_nothing_even_when_transparent() {
        // The round that makes no proposals adds no information: the pairing
        // it ends on is already published as the result.
        let mut ms = state(&[&[]], &[&[]]);
        let mut pairs = [NONE; MAX_PER_SIDE];
        let mut history = [[NONE; MAX_PER_SIDE]; MAX_HISTORY];

        let step = advance_matching(AdvanceInput {
            ms: &mut ms,
            pairs: &mut pairs,
            founder_count: 1,
            randomness: &flat(0),
            transparent: true,
            tick_no: 0,
            total: 0,
            history: &mut history,
            history_len: 0,
        })
        .unwrap();

        assert!(step.settled);
        assert_eq!(step.history_len, 0);
    }

    #[test]
    fn the_tick_counter_advances_once_per_step() {
        let mut ms = state(&[&[0, 1]], &[&[0], &[0]]);
        let mut pairs = [NONE; MAX_PER_SIDE];
        let mut history = [[NONE; MAX_PER_SIDE]; MAX_HISTORY];

        let step = advance_matching(AdvanceInput {
            ms: &mut ms,
            pairs: &mut pairs,
            founder_count: 1,
            randomness: &flat(0),
            transparent: false,
            tick_no: 41,
            total: 100,
            history: &mut history,
            history_len: 0,
        })
        .unwrap();

        assert_eq!(step.tick_no, 42);
        assert_eq!(step.total, 101);
        assert_eq!(step.proposals, 1);
    }

    // ------------------------------------------------------- validate_ranking
    //
    // These four refusals used to be checked only by scripts/negative.ts,
    // which needs a funded devnet wallet, takes minutes, and cannot run in CI.
    // The rules deciding whether somebody's list is accepted were verified by
    // hand, when somebody remembered, against a cluster that has to be up.

    /// The error code a refusal carries, or None when it was accepted.
    fn refusal(ranking: &[u8], opposite_count: u8) -> Option<u32> {
        match validate_ranking(ranking, opposite_count) {
            Ok(()) => None,
            Err(e) => match e {
                Error::AnchorError(inner) => Some(inner.error_code_number),
                _ => panic!("not an anchor error"),
            },
        }
    }

    const INVALID_RANKING: u32 = 6006;
    const DUPLICATE_IN_RANKING: u32 = 6007;

    #[test]
    fn a_partial_ranking_is_accepted() {
        // Shorter than the other side is the whole point: leaving people out
        // is how a participant says they would rather stay unmatched.
        assert_eq!(refusal(&[2], 4), None);
        assert_eq!(refusal(&[3, 0], 4), None);
    }

    #[test]
    fn a_complete_ranking_is_accepted() {
        assert_eq!(refusal(&[3, 1, 0, 2], 4), None);
    }

    #[test]
    fn an_empty_ranking_is_refused() {
        // Not a preference — a submission that says nothing, which the account
        // should not exist to hold.
        assert_eq!(refusal(&[], 4), Some(INVALID_RANKING));
    }

    #[test]
    fn a_ranking_longer_than_the_other_side_is_refused() {
        assert_eq!(refusal(&[0, 1, 2, 3, 0], 4), Some(INVALID_RANKING));
    }

    #[test]
    fn an_index_past_the_other_side_is_refused() {
        // Four builders means indices 0..=3. Index 4 is nobody.
        assert_eq!(refusal(&[4], 4), Some(INVALID_RANKING));
        assert_eq!(refusal(&[0, 9], 4), Some(INVALID_RANKING));
    }

    #[test]
    fn a_repeated_entry_is_refused_and_says_so() {
        // A different code from the others on purpose: "you listed someone
        // twice" is a different thing to fix from "that index is not real".
        assert_eq!(refusal(&[1, 1], 4), Some(DUPLICATE_IN_RANKING));
        assert_eq!(refusal(&[0, 2, 1, 2], 4), Some(DUPLICATE_IN_RANKING));
    }

    #[test]
    fn length_is_judged_before_contents() {
        // A ranking that is both too long and full of duplicates reports
        // InvalidRanking, because the length is the thing to fix first. The
        // caller shows one message, so which one it is matters.
        assert_eq!(refusal(&[1, 1, 1, 1, 1], 4), Some(INVALID_RANKING));
    }

    #[test]
    fn a_round_with_nobody_on_the_other_side_accepts_nothing() {
        // opposite_count of zero makes every ranking too long, including the
        // empty one, and there is genuinely nobody to rank.
        assert_eq!(refusal(&[], 0), Some(INVALID_RANKING));
        assert_eq!(refusal(&[0], 0), Some(INVALID_RANKING));
    }

    #[test]
    fn a_full_side_of_sixteen_is_accepted_whole() {
        // MAX_PER_SIDE exactly: the largest legal list, and the one that would
        // overflow the seen array if the index bound were wrong.
        let full: Vec<u8> = (0..MAX_PER_SIDE as u8).collect();
        assert_eq!(refusal(&full, MAX_PER_SIDE as u8), None);
    }

    #[test]
    fn an_index_of_255_does_not_overflow_the_seen_array() {
        // NONE is 255 and would index far past a [bool; 16] if the bound check
        // did not come first.
        assert_eq!(refusal(&[NONE], MAX_PER_SIDE as u8), Some(INVALID_RANKING));
    }

    // ------------------------------------------------------------ break_tie

    #[test]
    fn tie_goes_to_the_higher_byte() {
        // break_tie(r, builder 0, challenger 1, incumbent 0) reads r[1] vs r[0].
        let mut r = flat(0);
        r[0] = 100;
        r[1] = 200;
        assert!(break_tie(&r, 0, 1, 0));
        r[1] = 50;
        assert!(!break_tie(&r, 0, 1, 0));
    }

    #[test]
    fn equal_bytes_fall_back_to_index_order() {
        // Not arbitrary: with a degenerate seed the result still has to be
        // deterministic, or two validators replaying the round disagree.
        let r = flat(7);
        assert!(break_tie(&r, 0, 1, 2));
        assert!(!break_tie(&r, 0, 2, 1));
    }

    #[test]
    fn break_tie_is_deterministic() {
        let r = flat(3);
        let first = break_tie(&r, 1, 2, 3);
        for _ in 0..100 {
            assert_eq!(break_tie(&r, 1, 2, 3), first);
        }
    }

    #[test]
    fn break_tie_never_reads_out_of_bounds() {
        // builder * 3 + challenger is taken modulo 32, and MAX_PER_SIDE is 16,
        // so the largest index touched would be 15 * 3 + 15 = 60. Without the
        // modulo this panics.
        let r = flat(1);
        for b in 0..MAX_PER_SIDE {
            for c in 0..MAX_PER_SIDE {
                for i in 0..MAX_PER_SIDE {
                    let _ = break_tie(&r, b, c, i);
                }
            }
        }
    }

    // -------------------------------------------------- advance_one_round

    #[test]
    fn a_free_builder_accepts() {
        let mut ms = state(&[&[0]], &[&[0]]);
        let mut pairs = [NONE; MAX_PER_SIDE];
        assert_eq!(advance_one_round(&mut ms, &mut pairs, 1, &flat(0)), 1);
        assert_eq!(pairs[0], 0);
    }

    #[test]
    fn a_matched_founder_does_not_propose_again() {
        let mut ms = state(&[&[0, 1]], &[&[0]]);
        let mut pairs = [NONE; MAX_PER_SIDE];
        advance_one_round(&mut ms, &mut pairs, 1, &flat(0));
        assert_eq!(advance_one_round(&mut ms, &mut pairs, 1, &flat(0)), 0);
    }

    #[test]
    fn a_founder_who_runs_out_of_list_stays_unmatched() {
        // Founder 1 ranked only builder 0, who prefers founder 0.
        let pairs = settle(&[&[0], &[0]], &[&[0, 1], &[]], &flat(0));
        assert_eq!(pairs[0], 0);
        assert_eq!(pairs[1], NONE);
    }

    #[test]
    fn a_better_ranked_challenger_displaces_the_incumbent() {
        let pairs = settle(&[&[0], &[0]], &[&[1, 0], &[]], &flat(0));
        assert_eq!(pairs[1], 0);
        assert_eq!(pairs[0], NONE);
    }

    #[test]
    fn unranked_loses_to_every_real_rank() {
        // Builder 0 ranked founder 1 and not founder 0. Founder 0 proposes
        // first and is held, and must still lose the slot.
        let pairs = settle(&[&[0], &[0]], &[&[1], &[]], &flat(0));
        assert_eq!(pairs[1], 0);
        assert_eq!(pairs[0], NONE);
    }

    #[test]
    fn the_tie_break_decides_when_the_builder_ranked_neither() {
        // The branch the VRF exists for. Both founders want builder 0, who
        // ranked nobody. Index order would always hand it to founder 0.
        let mut incumbent_wins = flat(0);
        incumbent_wins[0] = 200;
        incumbent_wins[1] = 10;
        assert_eq!(settle(&[&[0], &[0]], &[&[], &[]], &incumbent_wins)[0], 0);

        let mut challenger_wins = flat(0);
        challenger_wins[0] = 10;
        challenger_wins[1] = 200;
        let pairs = settle(&[&[0], &[0]], &[&[], &[]], &challenger_wins);
        assert_eq!(pairs[1], 0, "the seed must be able to change who wins");
        assert_eq!(pairs[0], NONE);
    }

    #[test]
    fn no_builder_is_held_twice() {
        let pairs = settle(
            &[&[0, 1, 2], &[1, 0, 2], &[2, 1, 0]],
            &[&[2, 0, 1], &[0, 1, 2], &[1, 2, 0]],
            &flat(9),
        );
        let mut seen = [false; MAX_PER_SIDE];
        for b in pairs.iter().filter(|b| **b != NONE) {
            assert!(!seen[*b as usize], "builder {} held twice", b);
            seen[*b as usize] = true;
        }
    }

    /// SHARED-A with frontend/tests/matching.test.ts.
    ///
    /// Same lists, same seed, same expected pairing, asserted in both
    /// languages. Nothing else in the project checks that the algorithm the
    /// chain runs and the algorithm the page explains produce the same answer;
    /// four hundred generated markets prove the TypeScript is stable, not that
    /// it agrees with the Rust.
    ///
    /// The expected value here was wrong when it was first written by hand,
    /// and both implementations disagreed with it in the same way — which is
    /// how a pinned vector earns its place.
    #[test]
    fn shared_vector_a() {
        let founders: &[&[u8]] = &[&[0, 1, 2], &[1, 0, 2], &[1, 2, 0]];
        let builders: &[&[u8]] = &[&[1, 0, 2], &[0, 2, 1], &[2, 1, 0]];
        assert_eq!(settle(founders, builders, &flat(0)), vec![1, 0, 2]);
    }

    /// SHARED-B: the same, on a market that reaches the tie-break.
    ///
    /// Builder 0 ranked nobody, so the two founders proposing to it are
    /// separated only by the seed. A flat seed sends break_tie down its
    /// index-order fallback, and both languages have to fall the same way.
    #[test]
    fn shared_vector_b_reaches_the_tie_break() {
        let founders: &[&[u8]] = &[&[0], &[0], &[1]];
        let builders: &[&[u8]] = &[&[], &[2]];
        assert_eq!(settle(founders, builders, &flat(200)), vec![0, NONE, 1]);
    }

    #[test]
    fn an_empty_market_settles_immediately() {
        let mut ms = state(&[], &[]);
        let mut pairs = [NONE; MAX_PER_SIDE];
        assert_eq!(advance_one_round(&mut ms, &mut pairs, 0, &flat(0)), 0);
    }

    #[test]
    fn a_market_where_nobody_ranked_anybody_makes_no_proposals() {
        let mut ms = state(&[&[], &[]], &[&[], &[]]);
        let mut pairs = [NONE; MAX_PER_SIDE];
        assert_eq!(advance_one_round(&mut ms, &mut pairs, 2, &flat(0)), 0);
        assert_eq!(pairs[0], NONE);
        assert_eq!(pairs[1], NONE);
    }

    #[test]
    fn a_full_side_proposes_exactly_once_each() {
        // proposals is a u8 behind saturating_add. Sixteen founders proposing
        // in one round is the largest real case and the count must be exact.
        let list: Vec<u8> = (0..MAX_PER_SIDE as u8).collect();
        let founders: Vec<&[u8]> = (0..MAX_PER_SIDE).map(|_| list.as_slice()).collect();
        let builders: Vec<&[u8]> = (0..MAX_PER_SIDE).map(|_| list.as_slice()).collect();
        let mut ms = state(&founders, &builders);
        let mut pairs = [NONE; MAX_PER_SIDE];
        assert_eq!(
            advance_one_round(&mut ms, &mut pairs, MAX_PER_SIDE, &flat(0)),
            MAX_PER_SIDE as u8
        );
    }

    #[test]
    fn the_result_is_stable_on_a_market_with_ties() {
        // No blocking pair: no founder and builder would both rather have each
        // other. Checked here rather than only in TypeScript, because this is
        // the implementation the answer comes from.
        let founders: &[&[u8]] = &[&[0, 1], &[0, 1], &[1]];
        let builders: &[&[u8]] = &[&[2, 0], &[]];
        let pairs = settle(founders, builders, &flat(5));
        let rank = state(founders, builders).builder_rank;

        for (f, list) in founders.iter().enumerate() {
            let current_pos = list.iter().position(|b| *b == pairs[f]);
            for (pos, b) in list.iter().enumerate() {
                if let Some(cp) = current_pos {
                    if pos >= cp {
                        break;
                    }
                }
                let bi = *b as usize;
                match pairs.iter().position(|v| *v == *b) {
                    // A free builder who never ranked f is not blocked by f:
                    // leaving someone off your list is preferring nobody.
                    None => assert_eq!(
                        rank[bi][f], UNRANKED,
                        "founder {} and free builder {} block",
                        f, b
                    ),
                    Some(h) => assert!(
                        rank[bi][f] >= rank[bi][h],
                        "founder {} and builder {} block",
                        f,
                        b
                    ),
                }
            }
        }
    }

    // ------------------------------------------------------------- escrow

    /// A pairing table with `founder -> builder` for each entry given.
    fn paired(entries: &[(u8, u8)]) -> [u8; MAX_PER_SIDE] {
        let mut pairs = [NONE; MAX_PER_SIDE];
        for (f, b) in entries {
            pairs[*f as usize] = *b;
        }
        pairs
    }

    fn settle_ok(pairs: &[u8; MAX_PER_SIDE], f: u8, b: u8) -> Result<()> {
        check_settle(
            RoundStatus::Settled,
            Side::Founder,
            Side::Builder,
            f,
            b,
            pairs,
            EscrowState::Locked,
        )
    }

    #[test]
    fn a_matched_pair_can_be_paid() {
        assert!(settle_ok(&paired(&[(0, 1)]), 0, 1).is_ok());
    }

    #[test]
    fn paying_somebody_the_matching_did_not_choose_is_refused() {
        // The whole attack, in one line: the pairing says founder 0 owes
        // builder 1, and the transaction names builder 2 as the recipient.
        // Nothing else in the instruction would notice — the accounts are
        // real, the round settled, the escrow is funded.
        assert!(settle_ok(&paired(&[(0, 1)]), 0, 2).is_err());
    }

    #[test]
    fn an_unmatched_founder_pays_nobody() {
        assert!(settle_ok(&paired(&[(1, 0)]), 0, 0).is_err());
    }

    #[test]
    fn a_round_that_has_not_settled_pays_nothing() {
        for status in [
            RoundStatus::Open,
            RoundStatus::Sealing,
            RoundStatus::Matching,
        ] {
            let r = check_settle(
                status,
                Side::Founder,
                Side::Builder,
                0,
                1,
                &paired(&[(0, 1)]),
                EscrowState::Locked,
            );
            assert!(r.is_err(), "{status:?} debería fallar");
        }
    }

    #[test]
    fn money_only_ever_runs_from_a_founder_to_a_builder() {
        let pairs = paired(&[(0, 1)]);
        // Both sides swapped: a builder trying to be paid by another builder.
        assert!(check_settle(
            RoundStatus::Settled,
            Side::Builder,
            Side::Builder,
            0,
            1,
            &pairs,
            EscrowState::Locked
        )
        .is_err());
        // And a founder paying a founder.
        assert!(check_settle(
            RoundStatus::Settled,
            Side::Founder,
            Side::Founder,
            0,
            1,
            &pairs,
            EscrowState::Locked
        )
        .is_err());
    }

    #[test]
    fn an_escrow_pays_out_once() {
        for state in [EscrowState::Settled, EscrowState::Refunded] {
            let r = check_settle(
                RoundStatus::Settled,
                Side::Founder,
                Side::Builder,
                0,
                1,
                &paired(&[(0, 1)]),
                state,
            );
            assert!(r.is_err(), "{state:?} debería estar cerrado");
        }
    }

    #[test]
    fn an_index_past_the_table_is_refused_rather_than_panicking() {
        // NONE as an index is 255, well past MAX_PER_SIDE. Indexing with it
        // would panic inside a program, which is a failed transaction with no
        // error anybody can read.
        assert!(settle_ok(&paired(&[(0, 1)]), NONE, 1).is_err());
        assert!(settle_ok(&paired(&[(0, 1)]), MAX_PER_SIDE as u8, 1).is_err());
    }

    // ------------------------------------------------------------- refunds

    #[test]
    fn an_abandoned_round_releases_every_deposit() {
        // The property that makes this safe to put money into: nobody has to
        // still be around. Deadline passed, never settled, money comes home.
        let r = check_refund(
            RoundStatus::Open,
            1_000,
            1_000,
            Side::Founder,
            0,
            &paired(&[]),
            EscrowState::Locked,
        );
        assert!(r.is_ok());
    }

    #[test]
    fn a_live_round_does_not_release_deposits() {
        let r = check_refund(
            RoundStatus::Open,
            1_000,
            999,
            Side::Founder,
            0,
            &paired(&[]),
            EscrowState::Locked,
        );
        assert!(r.is_err());
    }

    #[test]
    fn the_deadline_second_itself_releases() {
        // `>=`, not `>`. An off-by-one here strands money for one more slot,
        // which is the kind of bug that only shows up with somebody's funds.
        assert!(check_refund(
            RoundStatus::Matching,
            500,
            500,
            Side::Founder,
            0,
            &paired(&[]),
            EscrowState::Locked
        )
        .is_ok());
    }

    #[test]
    fn a_settled_round_refunds_only_who_it_left_out() {
        let pairs = paired(&[(0, 0)]);
        // Founder 0 matched: keeps nothing back.
        assert!(check_refund(
            RoundStatus::Settled,
            0,
            9_999,
            Side::Founder,
            0,
            &pairs,
            EscrowState::Locked
        )
        .is_err());
        // Founder 1 unmatched: gets it back, even long past the deadline.
        assert!(check_refund(
            RoundStatus::Settled,
            0,
            9_999,
            Side::Founder,
            1,
            &pairs,
            EscrowState::Locked
        )
        .is_ok());
    }

    #[test]
    fn a_builder_escrow_is_always_returned() {
        // Builders do not deposit. One that exists is an anomaly, and the
        // only safe thing to do with money that should not be there is give
        // it back.
        assert!(check_refund(
            RoundStatus::Settled,
            0,
            1,
            Side::Builder,
            0,
            &paired(&[(0, 0)]),
            EscrowState::Locked
        )
        .is_ok());
    }

    #[test]
    fn a_refund_happens_once() {
        for state in [EscrowState::Settled, EscrowState::Refunded] {
            assert!(check_refund(
                RoundStatus::Open,
                0,
                9_999,
                Side::Founder,
                0,
                &paired(&[]),
                state
            )
            .is_err());
        }
    }

    #[test]
    fn a_settled_round_cannot_refund_an_index_past_the_table() {
        assert!(check_refund(
            RoundStatus::Settled,
            0,
            1,
            Side::Founder,
            NONE,
            &paired(&[(0, 0)]),
            EscrowState::Locked
        )
        .is_err());
    }

    #[test]
    fn settling_and_refunding_can_never_both_be_legal() {
        // The invariant that keeps the two paths from paying the same lamports
        // twice. Swept over every pairing of a four-founder round.
        for f in 0..4u8 {
            for b in 0..4u8 {
                for status in [
                    RoundStatus::Open,
                    RoundStatus::Sealing,
                    RoundStatus::Matching,
                    RoundStatus::Settled,
                ] {
                    let pairs = paired(&[(0, 0), (2, 1)]);
                    let can_settle = check_settle(
                        status,
                        Side::Founder,
                        Side::Builder,
                        f,
                        b,
                        &pairs,
                        EscrowState::Locked,
                    )
                    .is_ok();
                    let can_refund = check_refund(
                        status,
                        0,
                        9_999,
                        Side::Founder,
                        f,
                        &pairs,
                        EscrowState::Locked,
                    )
                    .is_ok();
                    assert!(
                        !(can_settle && can_refund),
                        "founder {f}, builder {b}, {status:?}: ambas rutas abiertas"
                    );
                }
            }
        }
    }
}
