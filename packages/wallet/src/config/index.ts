export * from "./platform-asset";
export * from "./service-urls";
export * from "./stellar-limits";
export * from "./stellar-network";

import { stellarNetwork } from "./stellar-network";

/** The network passphrase transactions are built and signed against. */
export const networkPassphrase = stellarNetwork.passphrase;
