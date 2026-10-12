import { Networks } from "@stellar/stellar-sdk";
import { AppError, isEnvValidationSkipped } from "@wadzzo/errors";

export type StellarNetworkName = "testnet" | "mainnet";

/**
 * Everything that differs between testnet and mainnet, in one place. Wallets
 * that name the network their own way (Albedo, WalletConnect) get those names
 * here too, so no provider ever branches on "is this mainnet?".
 */
export interface StellarNetworkConfig {
  readonly name: StellarNetworkName;
  readonly isMainnet: boolean;
  /** The network passphrase transactions are built and signed against. */
  readonly passphrase: string;
  readonly horizonUrl: string;
  /** Name Albedo expects ("public" | "testnet"). */
  readonly albedoNetwork: "public" | "testnet";
  /** Name Rabet expects ("mainnet" | "testnet"), not the passphrase. */
  readonly rabetNetwork: "mainnet" | "testnet";
  /** CAIP-2 chain id WalletConnect sessions use. */
  readonly walletConnectChain: "stellar:pubnet" | "stellar:testnet";
  readonly stellarExpertNetwork: "public" | "testnet";
}

export const STELLAR_NETWORKS: Readonly<Record<StellarNetworkName, StellarNetworkConfig>> = {
  testnet: {
    name: "testnet",
    isMainnet: false,
    passphrase: Networks.TESTNET,
    horizonUrl: "https://horizon-testnet.stellar.org",
    albedoNetwork: "testnet",
    rabetNetwork: "testnet",
    walletConnectChain: "stellar:testnet",
    stellarExpertNetwork: "testnet",
  },
  mainnet: {
    name: "mainnet",
    isMainnet: true,
    passphrase: Networks.PUBLIC,
    horizonUrl: "https://horizon.stellar.org",
    albedoNetwork: "public",
    rabetNetwork: "mainnet",
    walletConnectChain: "stellar:pubnet",
    stellarExpertNetwork: "public",
  },
};

/**
 * Which network this deployment runs on.
 *
 * - `NEXT_PUBLIC_STELLAR_NETWORK` = "testnet" | "mainnet" (preferred)
 * - `NEXT_PUBLIC_STELLAR_PUBNET`  = "true" | "false" (legacy, still accepted)
 *
 * The `process.env.NEXT_PUBLIC_*` reads are written out in full on purpose:
 * Next.js only inlines them into browser bundles when they are literal.
 */
export function resolveStellarNetworkName(): StellarNetworkName {
  const named = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  if (named === "testnet" || named === "mainnet") return named;
  if (named !== undefined && named !== "") {
    throw new AppError("CONFIG_MISSING", {
      message: `NEXT_PUBLIC_STELLAR_NETWORK must be "testnet" or "mainnet", got "${named}".`,
      details: { name: "NEXT_PUBLIC_STELLAR_NETWORK" },
    });
  }

  const legacy = process.env.NEXT_PUBLIC_STELLAR_PUBNET;
  if (legacy === "true") return "mainnet";
  if (legacy === "false") return "testnet";

  // Builds that skip env validation have no network and must never touch mainnet.
  if (isEnvValidationSkipped()) return "testnet";

  throw new AppError("CONFIG_MISSING", {
    message: 'Set NEXT_PUBLIC_STELLAR_NETWORK to "testnet" or "mainnet".',
    details: { name: "NEXT_PUBLIC_STELLAR_NETWORK" },
  });
}

/** The network config for this deployment. */
export const stellarNetwork: StellarNetworkConfig = STELLAR_NETWORKS[resolveStellarNetworkName()];

/** Where to look an account up on a block explorer. */
export const stellarExpertAccountUrl = (publicKey: string, network = stellarNetwork) =>
  `https://stellar.expert/explorer/${network.stellarExpertNetwork}/account/${publicKey}`;
