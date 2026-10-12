import axios from "axios";
import { z } from "zod";

import { AppError, ErrorCodes, requireEnv } from "@wadzzo/errors";

import { ACCOUNT_SECRET_URL } from "../config/service-urls";

const secretResponseSchema = z.object({ secretKey: z.string().min(56) });

/**
 * Server-only: the secret key of the custodial account behind `email`, from the
 * accounts service. Never send it to a browser or log it.
 */
export async function fetchCustodialAccountSecret(email: string): Promise<string> {
  const serviceKey = requireEnv("RUBY_ACCOUNTS_SECRET", process.env.RUBY_ACCOUNTS_SECRET);
  try {
    const response = await axios.get(ACCOUNT_SECRET_URL, { params: { email, uid: serviceKey } });
    return (await secretResponseSchema.parseAsync(response.data)).secretKey;
  } catch (cause) {
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
      message: "Couldn't load the account key.",
      cause,
    });
  }
}
