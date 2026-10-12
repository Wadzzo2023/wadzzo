import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveStellarNetworkName, STELLAR_NETWORKS } from "../config/stellar-network";

afterEach(() => vi.unstubAllEnvs());

describe("resolveStellarNetworkName", () => {
  it("reads NEXT_PUBLIC_STELLAR_NETWORK", () => {
    vi.stubEnv("NEXT_PUBLIC_STELLAR_NETWORK", "mainnet");
    expect(resolveStellarNetworkName()).toBe("mainnet");
    vi.stubEnv("NEXT_PUBLIC_STELLAR_NETWORK", "testnet");
    expect(resolveStellarNetworkName()).toBe("testnet");
  });

  it("still accepts the legacy NEXT_PUBLIC_STELLAR_PUBNET flag", () => {
    vi.stubEnv("NEXT_PUBLIC_STELLAR_NETWORK", "");
    vi.stubEnv("NEXT_PUBLIC_STELLAR_PUBNET", "true");
    expect(resolveStellarNetworkName()).toBe("mainnet");
    vi.stubEnv("NEXT_PUBLIC_STELLAR_PUBNET", "false");
    expect(resolveStellarNetworkName()).toBe("testnet");
  });

  it("refuses a value that isn't a network, rather than guessing", () => {
    vi.stubEnv("NEXT_PUBLIC_STELLAR_NETWORK", "pubnet");
    expect(() => resolveStellarNetworkName()).toThrowError(/testnet.*mainnet/);
  });

  it("refuses to run with no network set", () => {
    vi.stubEnv("NEXT_PUBLIC_STELLAR_NETWORK", "");
    vi.stubEnv("NEXT_PUBLIC_STELLAR_PUBNET", "");
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    expect(() => resolveStellarNetworkName()).toThrowError(/NEXT_PUBLIC_STELLAR_NETWORK/);
  });

  it("falls back to testnet (never mainnet) when env validation is skipped", () => {
    vi.stubEnv("NEXT_PUBLIC_STELLAR_NETWORK", "");
    vi.stubEnv("NEXT_PUBLIC_STELLAR_PUBNET", "");
    vi.stubEnv("SKIP_ENV_VALIDATION", "1");
    expect(resolveStellarNetworkName()).toBe("testnet");
  });
});

describe("STELLAR_NETWORKS", () => {
  it("keeps every network-specific name together and consistent", () => {
    expect(STELLAR_NETWORKS.mainnet).toMatchObject({
      isMainnet: true,
      albedoNetwork: "public",
      rabetNetwork: "mainnet",
      walletConnectChain: "stellar:pubnet",
      horizonUrl: "https://horizon.stellar.org",
    });
    expect(STELLAR_NETWORKS.testnet).toMatchObject({
      isMainnet: false,
      albedoNetwork: "testnet",
      rabetNetwork: "testnet",
      walletConnectChain: "stellar:testnet",
      horizonUrl: "https://horizon-testnet.stellar.org",
    });
    expect(STELLAR_NETWORKS.mainnet.passphrase).not.toBe(STELLAR_NETWORKS.testnet.passphrase);
  });
});
