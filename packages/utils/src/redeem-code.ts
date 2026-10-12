/** 32 unambiguous characters: no O/0 or I/1, since these get read aloud. */
const REDEEM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REDEEM_CODE_LENGTH = 6;

/** A 6-character code a fan shows to redeem a collected pin. */
export function generateRedeemCode(): string {
  return Array.from(
    { length: REDEEM_CODE_LENGTH },
    () => REDEEM_ALPHABET[Math.floor(Math.random() * REDEEM_ALPHABET.length)],
  ).join("");
}
