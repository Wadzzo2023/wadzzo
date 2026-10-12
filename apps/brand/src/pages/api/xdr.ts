// nextjs 14 api routes
import type { NextApiRequest, NextApiResponse } from "next";
import { buildLoginChallengeXdr } from "@wadzzo/wallet/server";
import { z } from "zod";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const pubkey = z.string().length(56).parse(req.query.pubkey);
    const xdr = await buildLoginChallengeXdr({ publicKey: pubkey });

    res.status(200).json({ xdr });
  } catch (e) {
    res
      .status(500)
      .json({ error: "An error occurred while processing your request" });
  }
}
