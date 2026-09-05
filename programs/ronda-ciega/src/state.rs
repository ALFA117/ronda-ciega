use anchor_lang::prelude::*;

/// Participants per side. Bounds every fixed-size table below, and with it the
/// size of `MatchState` (the account each tick loads). 16 keeps that account
/// under 600 bytes, which is what lets a tick be a single tiny transaction.
pub const MAX_PER_SIDE: usize = 16;

/// Sentinel for "no index here" in `cursor` / `hold` / `pairs`. `MAX_PER_SIDE`
/// is far below 255, so this can never collide with a real index.
pub const NONE: u8 = u8::MAX;

/// Sentinel rank for "this person is not on my list at all". Compares as worse
/// than every real rank, so an unranked proposer only ever wins an empty slot.
pub const UNRANKED: u8 = u8::MAX;

/// Snapshots kept for a transparent round. Beyond this the animation simply
/// stops recording; the matching itself is unaffected.
pub const MAX_HISTORY: usize = 24;

pub const MAX_HANDLE_LEN: usize = 32;
pub const MAX_LINK_LEN: usize = 96;

/// Which half of the market someone is in.
///
/// `Founder` is the **proposing** side and `Builder` the **receiving** side.
/// That choice is not cosmetic: Gale–Shapley is optimal for whichever side
/// proposes, so this makes every round founder-optimal. It is disclosed in the
/// UI rather than hidden, because a matching market that quietly favours one
/// side is exactly the failure this project exists to fix.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Side {
    Founder,
    Builder,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum RoundStatus {
    /// Accepting participants and private rankings.
    Open,
    /// Deadline passed. Rankings are being ingested into `MatchState`.
    Sealing,
    /// Ingest complete, proposal ticks are running.
    Matching,
    /// Converged. `pairs` is final and safe to publish.
    Settled,
}

/// Public, lives on L1, delegated to the TEE rollup for the duration of the
/// round and committed back when it settles.
#[account]
pub struct Round {
    pub authority: Pubkey,
    pub round_id: u64,
    pub deadline_ts: i64,
    /// A round cannot close below this many people per side. Small pools leak
    /// preferences by elimination — see docs/SPEC.md section 7.
    pub min_per_side: u8,
    pub founder_count: u8,
    pub builder_count: u8,
    /// How many private rankings have been submitted so far (both sides).
    pub ranking_count: u8,
    /// How many have been ingested into `MatchState` during `Sealing`.
    pub sealed_count: u8,
    /// Proposal round number. Also the frame counter the UI animates on.
    pub tick: u16,
    /// `pairs[founder_index] = builder_index`, or `NONE`. This is the only
    /// output of the whole process that ever becomes public.
    pub pairs: [u8; MAX_PER_SIDE],
    pub status: RoundStatus,
    /// VRF output, used only to break ties between two proposers that a
    /// receiver did not rank at all. Published so anyone can replay the
    /// tie-breaks without seeing a single preference.
    pub randomness: [u8; 32],
    pub randomness_fulfilled: bool,
    /// A transparent round publishes its intermediate states so the algorithm
    /// can be watched running. That is a real disclosure, not a display option:
    /// the sequence of proposals and rejections reconstructs much of everyone's
    /// ranking. Demo rounds set it; rounds with real people must not, and the
    /// UI says so at creation time rather than burying it.
    pub transparent: bool,
    /// Per-tick snapshots of `pairs`, recorded only when `transparent`.
    pub history: [[u8; MAX_PER_SIDE]; MAX_HISTORY],
    pub history_len: u8,
    /// Total proposals made across every round. A public measure of how much
    /// work the matching actually took, without revealing who proposed.
    pub total_proposals: u32,
    /// When the matching converged. Zero until it does.
    pub settled_ts: i64,
    pub bump: u8,
}

impl Round {
    pub const LEN: usize = 32
        + 8
        + 8
        + 1
        + 1
        + 1
        + 1
        + 1
        + 2
        + MAX_PER_SIDE
        + 1
        + 32
        + 1
        + 1
        + (MAX_HISTORY * MAX_PER_SIDE)
        + 1
        + 4
        + 8
        + 1;
}

/// Public profile. Deliberately the same information someone already publishes
/// in a builder directory — the private part is never who you are, only who
/// you want.
#[account]
pub struct Participant {
    pub round: Pubkey,
    pub wallet: Pubkey,
    pub side: Side,
    pub index: u8,
    pub handle: String,
    pub link: String,
    pub bump: u8,
}

impl Participant {
    pub const LEN: usize =
        32 + 32 + 1 + 1 + (4 + MAX_HANDLE_LEN) + (4 + MAX_LINK_LEN) + 1;
}

/// Created **inside** the ephemeral rollup, never on L1, behind a permission
/// whose only member is the owner. It is closed at the end of the round
/// without ever being committed, which is the whole point: unlike a
/// commit-reveal, there is no step at which this becomes public.
#[account]
pub struct Preferences {
    pub round: Pubkey,
    pub owner: Pubkey,
    pub side: Side,
    /// Index of the owner within their own side.
    pub index: u8,
    /// How many entries of `ranking` are meaningful.
    pub len: u8,
    /// Indices into the *other* side, best first.
    pub ranking: [u8; MAX_PER_SIDE],
    pub bump: u8,
}

impl Preferences {
    pub const LEN: usize = 32 + 32 + 1 + 1 + 1 + MAX_PER_SIDE + 1;
}

/// The working memory of the algorithm. Also ephemeral and also private — it
/// holds every ranking in the round, so it never leaves the TEE either.
///
/// Storing the inverse ranking (`builder_rank`) alongside the forward one is
/// what makes a tick O(n) instead of O(n²): deciding whether a builder prefers
/// a new proposer over the one they are holding becomes a single array lookup.
#[account]
pub struct MatchState {
    pub round: Pubkey,
    /// `founder_ranking[f]` = founder f's ordered list of builder indices.
    pub founder_ranking: [[u8; MAX_PER_SIDE]; MAX_PER_SIDE],
    pub founder_len: [u8; MAX_PER_SIDE],
    /// `builder_rank[b][f]` = position of founder f in builder b's list, or
    /// `UNRANKED`. The inverse of the list, precomputed at ingest.
    pub builder_rank: [[u8; MAX_PER_SIDE]; MAX_PER_SIDE],
    /// Next slot in their own ranking that founder f will propose to.
    pub cursor: [u8; MAX_PER_SIDE],
    /// Founder index that builder b is tentatively holding, or `NONE`.
    pub hold: [u8; MAX_PER_SIDE],
    pub bump: u8,
}

impl MatchState {
    pub const LEN: usize = 32
        + (MAX_PER_SIDE * MAX_PER_SIDE)
        + MAX_PER_SIDE
        + (MAX_PER_SIDE * MAX_PER_SIDE)
        + MAX_PER_SIDE
        + MAX_PER_SIDE
        + 1;
}
