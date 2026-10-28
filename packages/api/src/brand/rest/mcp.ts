import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { db } from "@wadzzo/db/server";
import { getCurrentPlatform } from "@wadzzo/platform/server";

import { createMcpServer } from "../mcp/server";
import { bearerMcpToken, mcpSession } from "../mcp/token";

/**
 * `/api/mcp`: the brand portal's MCP server over Streamable HTTP. Stateless:
 * every POST carries its own token and gets a fresh server, so it runs on
 * serverless functions without sticky sessions.
 */

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

export async function POST(req: Request): Promise<Response> {
  const token = bearerMcpToken(req.headers.get("authorization"));
  const platform = await getCurrentPlatform();
  const session = token ? await mcpSession(db, platform, token) : null;
  if (!session)
    return json(
      401,
      {
        error: "unauthorized",
        error_description:
          "Send a brand portal MCP token as `Authorization: Bearer wz_mcp_…` (Settings → AI connections).",
      },
      { "www-authenticate": 'Bearer realm="mcp"' },
    );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await createMcpServer(session, platform).connect(transport);
  return transport.handleRequest(req);
}

/** No server-initiated stream or session to end in stateless mode. */
export function GET(): Response {
  return json(
    405,
    { error: "method_not_allowed", error_description: "POST MCP requests here." },
    { allow: "POST" },
  );
}

export const DELETE = GET;
