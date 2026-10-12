import { toast } from "react-hot-toast";

import { WalletType } from "../../wallet-type";
import type { WalletProvider } from "../wallet-provider";
import { submitCustodialTransaction } from "./submit-custodial-transaction";

/**
 * Email + password accounts sign in through the dialog's form (Firebase), not a
 * button, so `login` here only explains that; signing works like any custodial account.
 */
export const emailPasswordProvider: WalletProvider = {
  type: WalletType.emailPass,
  label: "Email",

  async login() {
    toast.error("Use the email form to sign in.");
  },

  signAndSubmit: (xdr) => submitCustodialTransaction(xdr),
};

/** Admins act through the server, which signs; the browser only submits. */
export const adminProvider: WalletProvider = {
  type: WalletType.isAdmin,
  label: "Admin",

  async login() {
    toast.error("Admin sessions are created from the admin console.");
  },

  signAndSubmit: (xdr) => submitCustodialTransaction(xdr),
};
