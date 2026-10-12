export * from "./platform-asset";
export * from "./service-urls";
export * from "./stellar-limits";
export * from "./stellar-network";

import { stellarNetwork } from "./stellar-network";

/** Compat names the apps used before the network config object existed. */
export const networkPassphrase = stellarNetwork.passphrase;
export const STELLAR_URL = stellarNetwork.horizonUrl;
