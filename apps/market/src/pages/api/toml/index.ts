import type { NextApiRequest, NextApiResponse } from "next";

import { applyCors } from "@wadzzo/api/shared/cors";
import { renderStellarToml } from "@wadzzo/platform/stellar-toml";

/** `/.well-known/stellar.toml` (rewritten to this route in next.config.js). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (await applyCors(req, res, { origin: "*" })) return;
  res.send(await renderStellarToml());
}
