use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Deadline must be in the future")]
    DeadlineInPast,
    #[msg("Round is not accepting participants or rankings")]
    RoundClosed,
    #[msg("Round has not reached its deadline yet")]
    RoundStillOpen,
    #[msg("Round is not in the expected state for this instruction")]
    WrongRoundStatus,
    #[msg("This side of the round is full")]
    SideFull,
    #[msg("Round needs more participants on each side before it can close")]
    NotEnoughParticipants,
    #[msg("Ranking is empty, too long, or references a participant that does not exist")]
    InvalidRanking,
    #[msg("Ranking contains the same participant more than once")]
    DuplicateInRanking,
    #[msg("Preferences account does not belong to this round")]
    WrongRound,
    #[msg("Preferences have already been ingested for this participant")]
    AlreadySealed,
    #[msg("Not every ranking has been ingested yet")]
    SealIncomplete,
    #[msg("Handle or link exceeds its maximum length")]
    ProfileTooLong,
    #[msg("Session token is missing, expired, or not authorized for this wallet")]
    InvalidSession,
    #[msg("This account has already been closed")]
    AlreadyClosed,
    #[msg("Preferences account is not owned by this program or is not at its expected address")]
    InvalidPreferencesAccount,
    #[msg("Randomness has already been fulfilled for this round")]
    RandomnessAlreadyFulfilled,
    #[msg("Matching cannot run until the VRF callback has delivered randomness")]
    RandomnessMissing,
    #[msg("Tick budget must be at least 1")]
    InvalidTickBudget,
    #[msg("Arithmetic overflow")]
    MathOverflow,

    // Escrow. Every one of these is a refusal somebody can hit by accident,
    // so each says which of the two accounts or which of the two states was
    // wrong rather than reporting that something was.
    #[msg("An escrow has to hold something. Send an amount above zero")]
    NothingToEscrow,
    #[msg("The round has not settled, so there is no pairing to pay out yet")]
    NotSettledYet,
    #[msg("A payment runs from a founder to a builder, and these are not")]
    WrongSide,
    #[msg("That index is not a participant in this round")]
    NoSuchParticipant,
    #[msg("This participant went unmatched, so there is nobody to pay")]
    WentUnmatched,
    #[msg("The matching did not pair these two")]
    NotYourPair,
    #[msg("This escrow was already paid out or already returned")]
    EscrowAlreadyDone,
    #[msg("Nothing to refund: the round is still live and this deposit is still matched")]
    NothingToRefund,
}
