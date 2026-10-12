import { unitTestConfig } from "@wadzzo/vitest-config";

export default unitTestConfig(import.meta.dirname, {
  env: {
    NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
    NEXT_PUBLIC_ASSET_CODE: "TESTTOKEN",
    NEXT_PUBLIC_ASSET_ISSUER: "GAPWBIC6RVQZCLBQ4GTZSI3I7YRYTSBC7EJ65KHHPL4T5CJECU3PQ7PD",
  },
});
