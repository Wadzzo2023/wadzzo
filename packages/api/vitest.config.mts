import { unitTestConfig } from "@wadzzo/vitest-config";

export default unitTestConfig(import.meta.dirname, {
  // The config modules read these at import time, like a real deployment.
  env: {
    NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
    NEXT_PUBLIC_ASSET_CODE: "TESTTOKEN",
    NEXT_PUBLIC_ASSET_ISSUER: "GAPWBIC6RVQZCLBQ4GTZSI3I7YRYTSBC7EJ65KHHPL4T5CJECU3PQ7PD",
    // a throwaway key, only used by the tests
    MOTHER_SECRET: "SDYG3V3RQV55OZPLTXJWIT5LBGD2XZTAPX773UYQL6QTTU2FMNUPMS3D",
  },
});
