export * from "package/connect_wallet/src/lib/stellar/constant";

/** Each extra subentry (trustline, offer, data entry) locks this much XLM. */
export const BASE_RESERVE_XLM = 0.5;
/** A Stellar account can hold at most this many subentries. */
export const MAX_SUBENTRIES = 1000;
/** Flat platform fee when paying in XLM. */
export const PLATFORM_FEE_XLM = 2;
/** A built transaction is valid this long; the quote shown with it is honoured until then. */
export const TX_TIMEOUT_SECONDS = 300;
