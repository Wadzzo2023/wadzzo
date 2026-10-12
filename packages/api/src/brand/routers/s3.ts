import { z } from "zod";

import { signCreatorUpload, uploadEndpoints } from "@wadzzo/storage";

import { createTRPCRouter, protectedProcedure } from "../trpc";

/** Most files one batch may sign (the multi-file upload slot takes five). */
const MAX_FILES_PER_BATCH = 20;

const fileUploadSchema = z.object({
  fileSize: z.number(),
  fileType: z.string(),
  checksum: z.string(),
  endPoint: z.enum(uploadEndpoints),
  fileName: z.string(),
});

/** The browser declares the file; the server signs a one-time upload straight to S3. */
export const s3Router = createTRPCRouter({
  getSignedURL: protectedProcedure.input(fileUploadSchema).mutation(({ input }) => {
    return signCreatorUpload(input);
  }),

  getSignedMultiURLs: protectedProcedure
    .input(
      z.object({
        files: z.array(fileUploadSchema).min(1).max(MAX_FILES_PER_BATCH),
        endPoint: z.enum(uploadEndpoints).default("multiBlobUploader"),
      }),
    )
    .mutation(({ input }) => Promise.all(input.files.map((file) => signCreatorUpload(file)))),
});
