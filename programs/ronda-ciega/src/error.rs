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
}
