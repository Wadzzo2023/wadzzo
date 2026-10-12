/* eslint-disable */
import { verifyMessageSignature } from "@albedo-link/signature-verification";
import axios from "axios";

import {
  getServerSession,
  type NextAuthOptions,
} from "next-auth";

import CredentialsProvider from "next-auth/providers/credentials";

import {
  sendEmailVerification,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { WalletType, type WadzzoSessionUser as User } from "@wadzzo/wallet/shared";
import { getOrCreateFirebaseUserFromApple, verifyFirebaseIdToken } from "@wadzzo/wallet/server";
import { firebaseAuth } from "@wadzzo/wallet/firebase";
import { accountServiceResponseSchema } from "@wadzzo/wallet/shared";
import { z } from "zod";
import { db } from "@wadzzo/db/server";
import { AuthCredential } from "@wadzzo/wallet/shared";
import { authorizeCredentials } from "~/server/auth/credentials";
import { truncateString } from "@wadzzo/utils/string";

import { USER_ACCOUNT_URL } from "@wadzzo/wallet/config";
import { verifyTransactionSignature } from "@wadzzo/wallet/server";
import { env } from "~/env";


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
        return authorizeCredentials(credentials as AuthCredential);
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
