/* eslint-disable */
import { verifyMessageSignature } from "@albedo-link/signature-verification";
import axios from "axios";

import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth";

import CredentialsProvider from "next-auth/providers/credentials";

import {
  sendEmailVerification,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { WalletType } from "package/connect_wallet";
import {
  appleTokenToUser,
  verifyIdToken,
} from "package/connect_wallet/src/lib/firebase/admin/auth";
import { auth } from "package/connect_wallet/src/lib/firebase/firebase-auth";
import { getPublicKeyAPISchema } from "package/connect_wallet/src/lib/stellar/wallet_clients/type";
import { z } from "zod";
import { db } from "~/server/db";
import { AuthCredentialType } from "~/types/auth";
import { authorizeCredentials } from "~/server/auth/credentials";
import { truncateString } from "~/utils/string";

import { USER_ACCOUNT_URL } from "package/connect_wallet/src/lib/stellar/constant";
import { verifyXDRSignature } from "package/connect_wallet/src/lib/stellar/trx/deummy";
import { env } from "~/env";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
type User = DefaultSession["user"] & {
  id: string;
  walletType: WalletType;
  emailVerified: boolean;
  // ...other properties
  // role: UserRole;
};

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: User;
  }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  callbacks: {
    session: ({ session, token }) => {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub,
          walletType: token.walletType,
          emailVerified: token.emailVerified,
        },
      };
    },
    jwt: ({ user, token }) => {
      const u = user as User;
      if (u) {
        token.walletType = u.walletType;
        token.emailVerified = u.emailVerified;
      }
      return token;
    },
  },
  // adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt",
  },

  providers: [
    CredentialsProvider({
      type: "credentials",
      credentials: {},
      async authorize(credentials): Promise<User | null> {
        return authorizeCredentials(credentials as AuthCredentialType);
      },
    }),
  ],


};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = () => getServerSession(authOptions);
