/** 32 unambiguous characters: no O/0 or I/1, since these get read aloud. */
const REDEEM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REDEEM_CODE_LENGTH = 6;

/**
 * A 6-character code a fan shows to redeem a collected pin.
 * Uses the platform's secure random source so codes can't be predicted.
 */
export function generateRedeemCode(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(REDEEM_CODE_LENGTH));
  // 256 is a multiple of 32, so taking the remainder adds no bias
  return Array.from(randomBytes, (byte) => REDEEM_ALPHABET[byte % REDEEM_ALPHABET.length]).join("");
}
