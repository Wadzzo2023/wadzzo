import type { NextApiRequest, NextApiResponse } from "next";

import { applyCors } from "../../shared/cors";

/** The game API's CORS policy (the Amplify-hosted game client). */
export function EnableCors(req: NextApiRequest, res: NextApiResponse) {
  return applyCors(req, res, { origin: "https://main.d3rraj3hpq09um.amplifyapp.com" });
}
