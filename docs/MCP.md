# MCP server (brand portal)

The brand portal serves the map agent (the chat on the Pins map) as an MCP server, so an AI app such as Claude or Cursor can use it as a brand.

| What     | Where                                                                            |
| -------- | -------------------------------------------------------------------------------- |
| Endpoint | `https://<brand portal>/api/mcp` (brand.wadzzo.com, clintonadmin.wadzzo.com)     |
| Code     | `packages/api/src/brand/mcp/` (server, tokens, formatting), `rest/mcp.ts` (HTTP) |
| Route    | `apps/brand/src/app/api/mcp/route.ts` (thin re-export)                           |
| Tokens   | Settings → AI connections; `McpToken` in the schema; `routers/mcp-tokens.ts`     |
| Tests    | `packages/api/src/brand/__tests__/mcp-token.test.ts`, `mcp-server.test.ts`       |

## How it works

- **Transport:** Streamable HTTP, stateless, JSON responses. Every POST carries its token and gets a fresh server, so it runs on Vercel functions (`maxDuration` 60 s).
- **Sign-in:** `Authorization: Bearer wz_mcp_…`. A token is shown once; only its SHA-256 is stored. It works on the platform it was created on, until revoked or the user is deleted.
- **Access:** each tool calls the agent tRPC router as the token's person, so the same rules apply as in the app: a brand acts for itself, an admin may pass `brandId` for a brand in their scope, conversations are per person, and each message counts toward the daily AI limit.
- **Changes:** the agent only proposes. `confirm_proposal` carries a proposal out (with the same edits as the card), `cancel_proposal` turns it down.
- **Privacy:** collector names and emails are never returned, only counts, as for the agent's own model.

## Tools

| Tool                                                            | Does                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `get_brand`                                                     | Brand, home area, example requests                                |
| `ask_agent`                                                     | Sends a message (new or existing conversation), waits up to ~45 s |
| `get_reply`                                                     | Keeps waiting for a long run                                      |
| `list_conversations`, `get_conversation`, `delete_conversation` | Conversation history                                              |
| `confirm_proposal`, `cancel_proposal`                           | Carry out or turn down a proposal                                 |
| `get_pin_job`                                                   | Progress of bulk pin creation after a confirmed `create_pins`     |

## Connecting

Settings → AI connections shows ready-to-paste setup, with the person's token filled in, for Claude Desktop (through `mcp-remote`), Claude Code, OpenAI Codex, the OpenAI API (Responses / Agents SDK hosted MCP tool), Antigravity, Cursor, VS Code, Gemini CLI, Windsurf and any other app that supports remote MCP servers with headers. The server name in every snippet is `wadzzo`; the setups live in `appSetups()` in `apps/brand/src/features/settings/ai-connections-tab.tsx`.

The shortest one, Claude Code:

```bash
claude mcp add --transport http wadzzo https://brand.wadzzo.com/api/mcp \
  --header "Authorization: Bearer wz_mcp_…"
```

Web connectors that only support OAuth (claude.ai, ChatGPT) aren't supported yet.
