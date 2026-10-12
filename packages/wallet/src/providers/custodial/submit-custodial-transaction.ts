import { submitSignedTransaction } from "../../stellar/horizon";

/** Custodial transactions arrive already signed by the server; only submit them. */
export async function submitCustodialTransaction(signedXdr: string): Promise<boolean> {
  await submitSignedTransaction(signedXdr);
  return true;
}
