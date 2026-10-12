import { unitTestConfig } from "@wadzzo/vitest-config";

// `pnpm test` runs the fast unit tests; the end-to-end ones (e2e/, `pnpm test:e2e`) hit the dev database and Stellar testnet.
export default unitTestConfig(import.meta.dirname);
