/** Server-side wallet API: sign-in verification and signing for custodial accounts. */
import "server-only";

export { buildLoginChallengeXdr, verifyTransactionSignature } from "./server/login-challenge";
export { fetchCustodialAccountSecret } from "./server/custodial-account-secret";
export { signXdrForCustodialUser, signXdrWithSecret } from "./server/sign-for-custodial-user";
export {
  deleteFirebaseUserByEmail,
  findEmailByFirebaseUid,
  findFirebaseUserByEmail,
  getOrCreateFirebaseUserFromApple,
  verifyFirebaseIdToken,
} from "./firebase/admin-users";
export { initFirebaseAdmin } from "./firebase/admin-app";
export { submitSignedTransaction } from "./stellar/horizon";
export { getTransactionHashHex } from "./stellar/transaction-hash";
