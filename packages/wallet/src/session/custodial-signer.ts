import { z } from "zod";

/**
 * Who the server signs for when the user has no key in their browser:
 * - `{ email }`: a custodial account (email, Google, Facebook, Apple); the
 *   accounts service holds the key
 * - `{ isAdmin }`: the platform's own account, for admin actions
 * - `undefined`: a real wallet; the browser signs
 */
export const custodialSignerSchema = z
  .object({ email: z.string() })
  .optional()
  .or(z.object({ isAdmin: z.boolean() }));

export type CustodialSigner = z.infer<typeof custodialSignerSchema>;
