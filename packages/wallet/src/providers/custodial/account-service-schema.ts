import { z } from "zod";

/** What the accounts service answers when asked for a user's Stellar account. */
export const accountServiceResponseSchema = z.object({
  publicKey: z.string().min(56),
  extra: z.object({
    isAccActive: z.boolean(),
    xdr: z.string().optional(),
  }),
});

export type AccountServiceResponse = z.infer<typeof accountServiceResponseSchema>;
