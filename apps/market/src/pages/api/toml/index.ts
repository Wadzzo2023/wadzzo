import type { NextApiRequest, NextApiResponse } from "next";
import NextCors from "nextjs-cors";

import { renderStellarToml } from "@wadzzo/platform/stellar-toml";

/** `/.well-known/stellar.toml` (rewritten to this route in next.config.js). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await NextCors(req, res, {
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    origin: "*",
    optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
  });
  res.send(await renderStellarToml());
}
