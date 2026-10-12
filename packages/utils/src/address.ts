import { truncateMiddle } from "./string";

/** `GABC...WXYZ`: the start and end of an address, for display. Empty string for no address. */
export function abbreviateAddress(address: string | undefined, edgeLength = 3): string {
  return address ? truncateMiddle(address, edgeLength, edgeLength) : "";
}

const STELLAR_PUBLIC_KEY_LENGTH = 56;

/** True for anything that can't be a Stellar public key (empty, or not 56 characters). */
export function isInvalidPublicKey(publicKey: string | undefined): boolean {
  return publicKey?.trim().length !== STELLAR_PUBLIC_KEY_LENGTH;
}
