/** The Wadzzo accounts service: creates and signs for custodial (email/social) accounts. */
const ACCOUNTS_SERVICE_URL = "https://accounts.action-tokens.com/";

export const USER_ACCOUNT_URL = `${ACCOUNTS_SERVICE_URL}api/account`;
export const USER_ACCOUNT_URL_APPLE = `${ACCOUNTS_SERVICE_URL}api/apple_private`;
export const USER_ACCOUNT_XDR_URL = `${ACCOUNTS_SERVICE_URL}api/account_xdr`;
/** Server-to-server: look up a custodial account's secret key. */
export const ACCOUNT_SECRET_URL = `${ACCOUNTS_SERVICE_URL}api/ruby_acc`;
