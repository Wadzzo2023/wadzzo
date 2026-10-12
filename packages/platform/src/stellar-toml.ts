import { db } from "@wadzzo/db/server";
import { PLATFORM_ASSET } from "@wadzzo/wallet/config";
import { ipfsHashToUrl } from "@wadzzo/utils/ipfs";

import { platformBranding } from "./branding";
import { getCurrentPlatform } from "./current-platform";

interface TomlCurrency {
  code: string;
  issuer: string;
  name: string;
  description: string | null;
  thumbnail: string;
}

/** One `[[CURRENCIES]]` entry of a stellar.toml. */
function currencyToml(currency: TomlCurrency): string {
  const ipfsHash = currency.thumbnail.split("/").pop();
  const lines = [
    "[[CURRENCIES]]",
    `code="${currency.code}"`,
    `issuer="${currency.issuer}"`,
    "display_decimals=7",
    `name="${currency.name}"`,
    `desc="${currency.description}"`,
  ];
  if (ipfsHash) lines.push(`image="${ipfsHashToUrl(ipfsHash)}"`);
  return `${lines.join("\n")}\n\n`;
}

/**
 * The organisation behind this deployment's assets. A deployment can override
 * every field with TOML_ORG_* (and TOML_PRINCIPAL_*); unset, it is the platform's own.
 */
function documentationToml(): string {
  const env = process.env;
  // A partner that sets its own name leaves unset fields out rather than showing the platform's.
  const isOverridden = Boolean(env.TOML_ORG_NAME);
  const { toml } = platformBranding;
  const field = (key: string, value: string | undefined, platformDefault: string | undefined) => {
    const resolved = value ?? (isOverridden ? undefined : platformDefault);
    return resolved ? [`${key}="${resolved}"`] : [];
  };

  const lines = [
    "[DOCUMENTATION]",
    ...field("ORG_NAME", env.TOML_ORG_NAME, toml.orgName),
    ...field("ORG_URL", env.TOML_ORG_URL, toml.orgUrl),
    ...field("ORG_LOGO", env.TOML_ORG_LOGO, toml.orgLogo),
    ...field("ORG_DESCRIPTION", env.TOML_ORG_DESCRIPTION, toml.orgDescription),
    ...field("ORG_TWITTER", env.TOML_ORG_TWITTER, toml.orgTwitter),
    ...field("ORG_OFFICIAL_EMAIL", env.TOML_ORG_OFFICIAL_EMAIL, toml.orgEmail),
    "",
  ];

  if (env.TOML_PRINCIPAL_NAME) {
    lines.push("[[PRINCIPALS]]", `name="${env.TOML_PRINCIPAL_NAME}"`);
    if (env.TOML_PRINCIPAL_EMAIL) lines.push(`email="${env.TOML_PRINCIPAL_EMAIL}"`);
    lines.push("");
  } else if (!isOverridden) {
    for (const principal of toml.principals) {
      lines.push("[[PRINCIPALS]]", `name="${principal.name}"`);
      if (principal.twitter) lines.push(`twitter="${principal.twitter}"`);
      if (principal.github) lines.push(`github="${principal.github}"`);
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The whole stellar.toml of this deployment: its organisation, then every
 * asset and page asset of its own platform (each platform's toml lives on its
 * own home domain).
 */
export async function renderStellarToml(): Promise<string> {
  const { id: platformId } = await getCurrentPlatform();

  const [assets, pageAssets] = await Promise.all([
    db.asset.findMany({
      where: { platformId },
      select: { issuer: true, code: true, name: true, description: true, thumbnail: true },
    }),
    db.creatorPageAsset.findMany({
      where: { creator: { platformId } },
      select: { issuer: true, code: true, thumbnail: true, creator: { select: { name: true } } },
    }),
  ]);

  let toml = documentationToml();
  for (const asset of assets) toml += currencyToml(asset);
  for (const asset of pageAssets) {
    toml += currencyToml({
      code: asset.code,
      issuer: asset.issuer,
      name: asset.creator.name || PLATFORM_ASSET.code,
      description: `Page Asset of ${asset.creator.name}`,
      thumbnail: asset.thumbnail ?? "",
    });
  }
  return toml;
}
