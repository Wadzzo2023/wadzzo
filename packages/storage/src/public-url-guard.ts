import { lookup } from "node:dns/promises";
import net from "node:net";

import { AppError, ErrorCodes } from "@wadzzo/errors";

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 15_000;
/** Largest remote file the server will pull in. */
export const MAX_REMOTE_FILE_BYTES = 25 * 1024 * 1024;

const refuse = (message: string, details?: Record<string, unknown>) =>
  new AppError(ErrorCodes.VALIDATION_FAILED, { message, details });

function isPrivateIPv4(address: string): boolean {
  const [a = 0, b = 0] = address.split(".").map(Number);
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

function isPrivateIPv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (/^fe[89ab]/.test(lower)) return true; // link-local

  // IPv4-mapped (::ffff:a.b.c.d), which URL parsing normalises to ::ffff:hhhh:hhhh
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (dotted?.[1]) return isPrivateIPv4(dotted[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex?.[1] && hex[2]) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return isPrivateIPv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return false;
}

const isPrivateAddress = (address: string): boolean =>
  net.isIPv4(address) ? isPrivateIPv4(address) : isPrivateIPv6(address);

/**
 * A URL the server may fetch on a user's behalf: http(s) only, and never an
 * address inside our own network (loopback, private ranges, cloud metadata).
 * Host names are resolved so a name can't point inward either.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw refuse("That isn't a valid link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw refuse("Only http and https links can be fetched.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw refuse("That link points to a private address.");
  }

  const addresses = net.isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address);
  if (addresses.length === 0) throw refuse("That link's host can't be reached.");
  if (addresses.some(isPrivateAddress)) throw refuse("That link points to a private address.");

  return url;
}

/**
 * Downloads a public file, following at most a few redirects and checking each
 * hop with `assertPublicHttpUrl`, with a time and size limit.
 */
export async function fetchPublicFile(
  sourceUrl: string,
  { maxBytes = MAX_REMOTE_FILE_BYTES }: { maxBytes?: number } = {},
): Promise<{ bytes: Buffer; contentType: string }> {
  let url = await assertPublicHttpUrl(sourceUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      url = await assertPublicHttpUrl(new URL(location, url).toString());
      continue;
    }

    if (!response.ok) {
      throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
        message: `Couldn't download the file (${response.status}).`,
        details: { status: response.status, host: url.hostname },
      });
    }

    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > maxBytes) throw refuse("That file is too large.");

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw refuse("That file is too large.");

    return { bytes, contentType: response.headers.get("content-type") ?? "" };
  }

  throw refuse("That link redirects too many times.");
}
