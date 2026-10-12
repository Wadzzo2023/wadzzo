import { z } from "zod";
import { ClaimXDR } from "~/lib/stellar/map/claim";
import { custodialSignerSchema } from "@wadzzo/wallet/shared";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { AppError, ErrorCodes } from "@wadzzo/errors";

export const trxRouter = createTRPCRouter({
  getSecretMessage: protectedProcedure.query(() => {
    return "you can now see this secret message!";
  }),
  getClaimXDR: protectedProcedure
    .input(
      z.object({
        signWith: custodialSignerSchema,
        locationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const location = await ctx.db.location.findUniqueOrThrow({
        where: { id: input.locationId },
        include: {
          locationGroup: {
            include: { creator: { include: { pageAsset: true }, omit: { storageSecret: false } }, asset: true },
          },
        },
      });

      if (!location.locationGroup?.asset && !location.locationGroup?.pageAsset)
        throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "Not claimable" });

      let code: string | undefined = undefined;
      let issuer: string | undefined = undefined;

      if (location.locationGroup.pageAsset) {
        if (!location.locationGroup.creator.pageAsset)
          throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "No page Asset, found!" });

        code = location.locationGroup.creator.pageAsset.code;
        issuer = location.locationGroup.creator.pageAsset.issuer;
      } else if (location.locationGroup.asset) {
        code = location.locationGroup.asset.code;
        issuer = location.locationGroup.asset.issuer;
      }

      const storageSecret = location.locationGroup.creator.storageSecret;

      if (code && issuer) {
        const xdr = await ClaimXDR({
          amount: "1",
          asset: { code, issuer },
          receiver: userId,
          signWith: input.signWith,
          storageSecret: storageSecret,
        });

        return xdr;
      } else throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Code and Issue not found" });
    }),
});
