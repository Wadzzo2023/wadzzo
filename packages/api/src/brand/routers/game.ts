import { z } from "zod";
import { decode } from "next-auth/jwt";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { env } from "../../env";

export const gameRouter = createTRPCRouter({
  decodeSessionToken: publicProcedure.input(z.string()).query(async ({ input }) => {
    const sessionToken = input;
    const decoded = await decode({
      token: sessionToken,
      secret: env.NEXTAUTH_SECRET ?? "",
    });
    // console.log(decoded);
    return decoded;
  }),
});
