import axios from "axios";

import { AppError, ErrorCodes } from "@wadzzo/errors";

import { USER_ACCOUNT_URL } from "../../config/service-urls";
import { accountServiceResponseSchema, type AccountServiceResponse } from "./account-service-schema";

/**
 * Asks the accounts service for (and, on first use, creates) the Stellar
 * account behind a Firebase user.
 */
export async function requestCustodialAccount(user: {
  uid: string;
  email: string | null | undefined;
}): Promise<AccountServiceResponse> {
  try {
    const response = await axios.get(USER_ACCOUNT_URL, {
      params: {
        uid: user.uid,
        email: user.email,
        from: process.env.NEXT_PUBLIC_ASSET_CODE,
      },
    });
    return await accountServiceResponseSchema.parseAsync(response.data);
  } catch (cause) {
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
      message: "Unable to get public key",
      cause,
    });
  }
}
