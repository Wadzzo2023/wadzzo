import { env } from "~/env";

/**
 * `clientsign`'s `test` flag: truthy routes submission at testnet endpoints.
 * `undefined` on pubnet rather than `false`, matching the reference — the flag
 * is checked for truthiness, and the distinction matters if it's ever
 * forwarded somewhere that treats the two differently.
 *
 * Deliberately its own module rather than living beside `buildFollowTrustlineXdr`:
 * that file reads `MOTHER_SECRET` and pulls in the Stellar SDK's signing
 * machinery, and client components import this. Keeping them apart is what
 * stops a server secret's module graph being dragged into the browser bundle.
 */
export function clientSelect() {
  return env.NEXT_PUBLIC_STELLAR_PUBNET ? undefined : true;
}
