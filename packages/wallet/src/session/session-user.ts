import type { DefaultSession } from "next-auth";

import type { WalletType } from "../wallet-type";

/** What every app's next-auth session carries about the signed-in user. */
export type WadzzoSessionUser = DefaultSession["user"] & {
  /** The user's Stellar public key. */
  id: string;
  walletType: WalletType;
  emailVerified: boolean;
};

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: WadzzoSessionUser;
  }
}
