import { applyCors } from "~/server/api-cors";
// nextjs 14 api routes

import { Asset } from "@wadzzo/db";
import type { NextApiRequest, NextApiResponse } from "next";
import { PLATFORM_ASSET } from "@wadzzo/wallet/config";
import { db } from "@wadzzo/db/server";
import { getCurrentPlatform } from "@wadzzo/platform/server";
import { ipfsHashToUrl } from "@wadzzo/utils/ipfs";
import { platformBranding } from "@wadzzo/platform/branding";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (await applyCors(req, res, { origin: "*" })) return;

  let FullTomlContent = documentationToml();

  // Only this deployment's own assets: each platform's toml lives on its own home domain.
  const { id: platformId } = await getCurrentPlatform();
  const assets = await db.asset.findMany({
    where: { platformId },
    select: {
      issuer: true,
      code: true,
      name: true,
      description: true,
      thumbnail: true,
      limit: true,
    },
  });

  const PageAssets = await db.creatorPageAsset.findMany({
    where: { creator: { platformId } },
    select: {
      issuer: true,
      code: true,
      thumbnail: true,
      limit: true,
      creator: true,
    },
  });

  for (const asset of assets) {
    FullTomlContent += dictionaryToTomlString(asset);
  }

  for (const asset of PageAssets) {
    const ipfsHash = asset.thumbnail?.split("/").pop();
    FullTomlContent += dictionaryToTomlString({
      code: asset.code,
      issuer: asset.issuer,
      name: asset.creator?.name || PLATFORM_ASSET.code,
      description: `Page Asset of ${asset.creator?.name}`,
      thumbnail: asset.thumbnail ?? "",
    });
  }

  res.send(FullTomlContent);

  return;

  // res.status(200).json({ message: assets });
}

export function dictionaryToTomlString(dict: {
  thumbnail: string;
  code: string;
  issuer: string;
  name: string;
  description: string | null;
}) {
  const ipfsHash = dict.thumbnail.split("/").pop();
  let tomlString = "[[CURRENCIES]]\n";
  tomlString += `code="${dict.code}"\n`;
  tomlString += `issuer="${dict.issuer}"\n`;
  tomlString += `display_decimals=7\n`;
  tomlString += `name="${dict.name}"\n`;
  tomlString += `desc="${dict.description}"\n`;
  if (ipfsHash) tomlString += `image="${ipfsHashToUrl(ipfsHash)}"\n`;

  return tomlString + "\n";
}

/**
 * The organisation behind this deployment's assets. A deployment can override
 * every field with TOML_ORG_* (and TOML_PRINCIPAL_*); unset, it is the platform's own.
 */
function documentationToml() {
  const e = process.env;
  const partner = Boolean(e.TOML_ORG_NAME);
  // A partner's unset fields are left out rather than showing Wadzzo's.
  const { toml } = platformBranding;
  const field = (key: string, value: string | undefined, platformDefault: string | undefined) => {
    const v = value ?? (partner ? undefined : platformDefault);
    return v ? [`${key}="${v}"`] : [];
  };
  const lines = [
    "[DOCUMENTATION]",
    ...field("ORG_NAME", e.TOML_ORG_NAME, toml.orgName),
    ...field("ORG_URL", e.TOML_ORG_URL, toml.orgUrl),
    ...field("ORG_LOGO", e.TOML_ORG_LOGO, toml.orgLogo),
    ...field("ORG_DESCRIPTION", e.TOML_ORG_DESCRIPTION, toml.orgDescription),
    ...field("ORG_TWITTER", e.TOML_ORG_TWITTER, toml.orgTwitter),
    ...field("ORG_OFFICIAL_EMAIL", e.TOML_ORG_OFFICIAL_EMAIL, toml.orgEmail),
    "",
  ];
  // Wadzzo's principal only describes Wadzzo's own toml.
  if (e.TOML_PRINCIPAL_NAME) {
    lines.push("[[PRINCIPALS]]", `name="${e.TOML_PRINCIPAL_NAME}"`);
    if (e.TOML_PRINCIPAL_EMAIL) lines.push(`email="${e.TOML_PRINCIPAL_EMAIL}"`);
    lines.push("");
  } else if (!partner) {
    for (const principal of toml.principals) {
      lines.push("[[PRINCIPALS]]", `name="${principal.name}"`);
      if (principal.twitter) lines.push(`twitter="${principal.twitter}"`);
      if (principal.github) lines.push(`github="${principal.github}"`);
      lines.push("");
    }
  }
  return lines.join("\n") + "\n";
}
