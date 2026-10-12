/** One stroop, the smallest unit of XLM. */
export const STROOP = "0.0000001";

/** Each extra subentry (trustline, offer, data entry) locks this much XLM. */
export const BASE_RESERVE_XLM = 0.5;
/** A Stellar account can hold at most this many subentries. */
export const MAX_SUBENTRIES = 1000;
/** XLM a brand-new account starts with (2 base reserves + room for fees). */
export const NEW_ACCOUNT_XLM = 1.5;
/** XLM a trustline costs to open. */
export const TRUST_XLM = 0.6;
/** Network fee we quote for a simple operation, in XLM. */
export const SIMPLIFIED_FEE_IN_XLM = 0.01;
/** Flat platform fee when paying in XLM. */
export const PLATFORM_FEE_XLM = 2;
/** A built transaction is valid this long; the quote shown with it is honoured until then. */
export const TX_TIMEOUT_SECONDS = 300;
/** Highest royalty a creator may set on resales. */
export const MAX_ROYALTY_PERCENT = 15;
