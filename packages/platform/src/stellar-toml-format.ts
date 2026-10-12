import { ipfsHashToUrl, urlToIpfsHash } from "@wadzzo/utils/ipfs";

/**
 * A TOML basic string: quoted, with everything that could end the string or
 * the line escaped. Asset names and descriptions are written by creators, so
 * they must never be able to add keys or tables to the file.
 */
export function tomlString(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    // remaining control characters are not allowed raw in TOML strings
    .replace(
      /[\u0000-\u001f\u007f]/g,
      (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
  return `"${escaped}"`;
}

/** `key="value"`, or nothing when there is no value. */
export const tomlField = (key: string, value: string | null | undefined): string[] =>
  value ? [`${key}=${tomlString(value)}`] : [];

export interface TomlCurrency {
  code: string;
  issuer: string;
  name: string;
  description: string | null;
  /** An IPFS hash, an IPFS gateway URL, or any other image URL. */
  thumbnail: string | null;
}

/** The public URL of a currency image (stored as an IPFS hash or as a full URL). */
export function currencyImageUrl(thumbnail: string | null | undefined): string | undefined {
  if (!thumbnail) return undefined;
  const ipfsHash = urlToIpfsHash(thumbnail);
  if (ipfsHash) return ipfsHashToUrl(ipfsHash);
  if (/^https?:\/\//i.test(thumbnail)) return thumbnail;
  // a bare hash, as older assets were saved
  return ipfsHashToUrl(thumbnail);
}

/** One `[[CURRENCIES]]` entry of a stellar.toml. */
export function currencyToml(currency: TomlCurrency): string {
  const lines = [
    "[[CURRENCIES]]",
    `code=${tomlString(currency.code)}`,
    `issuer=${tomlString(currency.issuer)}`,
    "display_decimals=7",
    `name=${tomlString(currency.name)}`,
    ...tomlField("desc", currency.description),
    ...tomlField("image", currencyImageUrl(currency.thumbnail)),
  ];
  return `${lines.join("\n")}\n\n`;
}
