import type { GetServerSidePropsContext } from "next";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import type { AuthCredential, WadzzoSessionUser } from "@wadzzo/wallet/shared";

import { authorizeCredentials } from "./authorize-credentials";

/** NextAuth options shared by every app: JWT sessions carrying the wallet type. */
export const authOptions: NextAuthOptions = {
  callbacks: {
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.sub,
        walletType: token.walletType,
        emailVerified: token.emailVerified,
      },
    }),
    jwt: ({ user, token }) => {
      const signedIn = user as WadzzoSessionUser | undefined;
      if (signedIn) {
        token.walletType = signedIn.walletType;
        token.emailVerified = signedIn.emailVerified;
      }
      return token;
    },
  },
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      type: "credentials",
      credentials: {},
      authorize: (credentials) =>
        authorizeCredentials(credentials as unknown as AuthCredential) as Promise<WadzzoSessionUser | null>,
    }),
  ],
};

/**
 * The signed-in session, from anywhere on the server. Pages-router code passes
 * its `{ req, res }`; App Router code and server components pass nothing.
 */
export function getServerAuthSession(context?: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}) {
  return context
    ? getServerSession(context.req, context.res, authOptions)
    : getServerSession(authOptions);
}
