import { PLATFORM_ASSET } from "~/lib/stellar/constant";
import { StellarAccount } from "~/lib/stellar/account";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

/**
 * ── User ───────────────────────────────────────────────────────────────────
 *
 * Wallet-derived facts about the signed-in viewer that don't belong to any
 * one brand or drop — currently just the platform asset balance shown on the
 * profile screen.
 */
export const userRouter = createTRPCRouter({
  /**
   * The signed-in wallet's holding of the platform asset (`PLATFORM_ASSET` —
   * WADZZO in production, configured per-environment via
   * `NEXT_PUBLIC_ASSET_CODE`/`NEXT_PUBLIC_ASSET_ISSUER`), read live from
   * Horizon rather than stored — same reasoning as every tier check in
   * `pins.ts`: there is no balance column on `User`, and a holding can change
   * without this app ever seeing the transaction.
   *
   * `session.user.id` is the wallet's own Stellar public key (see
   * `server/auth.ts`), so no separate account lookup is needed to know whose
   * balance this is.
   */
  platformBalance: protectedProcedure.query(async ({ ctx }) => {
    const account = await StellarAccount.createOrNull(ctx.session.user.id);
    return {
      assetCode: PLATFORM_ASSET.code,
      // An account Horizon has never seen — or one that's never opened a
      // trustline to this specific asset — genuinely holds none of it. Not
      // an error case; `createOrNull`/`getTokenBalance` already resolve both
      // to the same honest zero.
      balance: account?.getTokenBalance(
        PLATFORM_ASSET.code,
        PLATFORM_ASSET.issuer,
      ) ?? 0,
      hasTrustline: account?.hasTrustline(
        PLATFORM_ASSET.code,
        PLATFORM_ASSET.issuer,
      ) ?? false,
    };
  }),
});
