import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Session } from "next-auth";
import { z } from "zod";

import type { Platform } from "@wadzzo/db";
import { isKnownError } from "@wadzzo/errors/trpc";

import { createInnerTrpcContext } from "../../context";
import { ActionEditsInput } from "../server/agent/actions";
import { agentRouter } from "../routers/agent";
import { createCallerFactory } from "../trpc";
import { formatMessage } from "./format";

/**
 * ── MCP server: the map agent for AI apps ───────────────────────────────────
 *
 * The same chat as the Pins map, as tools. Every tool calls the agent router
 * as the token's person, so brand access, per-person conversations, the AI
 * quota and "nothing changes until confirmed" all work exactly as in the app.
 */

const createAgentCaller = createCallerFactory(agentRouter);
type AgentCaller = ReturnType<typeof createAgentCaller>;

/** How long one tool call waits for the agent (the function has 60 s). */
const WAIT_MS = 45_000;
const POLL_EVERY_MS = 1_500;

const brandId = z
  .string()
  .optional()
  .describe("Admins only: the brand to act for. Leave out to act for your own brand.");

const text = (s: string): CallToolResult => ({ content: [{ type: "text", text: s }] });

/** Runs a tool, turning the procedures' errors into a message the AI can read. */
async function safely(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (err) {
    if (!isKnownError(err)) console.error("[mcp]", err);
    return {
      isError: true,
      content: [{ type: "text", text: isKnownError(err) ? err.message : "Something went wrong." }],
    };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for a run, then shows its reply with the conversation's proposal states. */
async function awaitReply(
  agent: AgentCaller,
  jobId: string,
  conversationId: string | undefined,
  creatorId: string | undefined,
): Promise<CallToolResult> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const job = await agent.poll({ jobId });
    if (job.status === "failed")
      return { isError: true, ...text(job.error ?? "The agent failed.") };
    if (job.status === "completed") {
      if (!job.message) return text("The agent finished without a reply.");
      const actions = conversationId
        ? (await agent.conversation({ id: conversationId, creatorId })).actions
        : {};
      return text(
        [
          conversationId ? `Conversation \`${conversationId}\`` : "",
          formatMessage(job.message, actions),
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    }
    if (Date.now() > deadline) {
      const progress = job.steps.map((s) => `- ${s.label} [${s.status}]`).join("\n");
      return text(
        `The agent is still working (job \`${jobId}\`). Call get_reply with this jobId to wait for it.` +
          (progress ? `\n\nProgress:\n${progress}` : ""),
      );
    }
    await sleep(POLL_EVERY_MS);
  }
}

export function createMcpServer(session: Session, platform: Platform) {
  const agent = createAgentCaller(createInnerTrpcContext({ session, platform }));
  const server = new McpServer(
    { name: `${platform.name} brand agent`, version: "1.0.0" },
    {
      instructions:
        `The ${platform.name} brand portal's map agent. It finds real places and events, reports on the brand's pins, ` +
        "hotspots, events and announcements, and prepares changes to them. Start with ask_agent. " +
        "Changes are proposals: nothing happens until confirm_proposal is called, so show the person what a proposal " +
        "does and ask before confirming.",
    },
  );

  server.registerTool(
    "get_brand",
    {
      title: "Brand overview",
      description:
        "The brand the agent acts for, its home area (where searches look by default) and example requests.",
      inputSchema: { brandId },
      annotations: { readOnlyHint: true },
    },
    ({ brandId }) =>
      safely(async () => {
        const o = await agent.overview({ creatorId: brandId });
        return text(
          [
            `Brand: ${o.brand.name} (\`${o.brand.id}\`)`,
            `Home area: ${o.homeArea?.name ?? "not set"}`,
            `Try:\n${o.suggestions.map((s) => `- ${s}`).join("\n")}`,
          ].join("\n"),
        );
      }),
  );

  server.registerTool(
    "ask_agent",
    {
      title: "Ask the map agent",
      description:
        "Sends a message to the map agent and returns its answer: text plus cards (places found, pins, reports, " +
        "questions, proposals). Leave out conversationId to start a new conversation; pass it to continue one. " +
        "Each message counts toward the brand's daily AI limit. If the agent needs longer than about 45 seconds " +
        "the result gives a jobId for get_reply.",
      inputSchema: {
        text: z.string().min(1).max(2000).describe("The message, in plain language."),
        conversationId: z.string().optional().describe("Continue this conversation."),
        timeZone: z
          .string()
          .max(60)
          .optional()
          .describe(
            'IANA time zone, e.g. "America/Chicago", so "this weekend" means the right dates.',
          ),
        answer: z
          .object({
            messageId: z.string(),
            blockId: z.string(),
            labels: z.array(z.string().max(200)).max(20),
          })
          .optional()
          .describe("When replying to a question card: which options were picked."),
        brandId,
      },
    },
    (input) =>
      safely(async () => {
        const sent = await agent.send({ ...input, creatorId: input.brandId });
        return awaitReply(agent, sent.jobId, sent.conversationId, input.brandId);
      }),
  );

  server.registerTool(
    "get_reply",
    {
      title: "Wait for the agent's reply",
      description: "Waits for a reply that ask_agent said is still in progress.",
      inputSchema: {
        jobId: z.string(),
        conversationId: z.string().optional().describe("Shows proposal states with the reply."),
        brandId,
      },
      annotations: { readOnlyHint: true },
    },
    ({ jobId, conversationId, brandId }) =>
      safely(() => awaitReply(agent, jobId, conversationId, brandId)),
  );

  server.registerTool(
    "list_conversations",
    {
      title: "List conversations",
      description: "Your 40 most recent conversations with the agent for this brand.",
      inputSchema: { brandId },
      annotations: { readOnlyHint: true },
    },
    ({ brandId }) =>
      safely(async () => {
        const rows = await agent.conversations({ creatorId: brandId });
        if (rows.length === 0) return text("No conversations yet.");
        return text(
          rows
            .map(
              (c) => `- \`${c.id}\` ${c.title} (updated ${c.updatedAt.toISOString().slice(0, 16)})`,
            )
            .join("\n"),
        );
      }),
  );

  server.registerTool(
    "get_conversation",
    {
      title: "Read a conversation",
      description:
        "A conversation's messages with their cards and the current state of each proposal.",
      inputSchema: { conversationId: z.string(), brandId },
      annotations: { readOnlyHint: true },
    },
    ({ conversationId, brandId }) =>
      safely(async () => {
        const c = await agent.conversation({ id: conversationId, creatorId: brandId });
        return text(
          [`## ${c.title}`, ...c.messages.map((m) => formatMessage(m, c.actions))].join("\n\n"),
        );
      }),
  );

  server.registerTool(
    "delete_conversation",
    {
      title: "Delete a conversation",
      description: "Deletes a conversation and its messages. Changes already made stay.",
      inputSchema: { conversationId: z.string(), brandId },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    ({ conversationId, brandId }) =>
      safely(async () => {
        await agent.deleteConversation({ id: conversationId, creatorId: brandId });
        return text("Conversation deleted.");
      }),
  );

  server.registerTool(
    "confirm_proposal",
    {
      title: "Confirm a proposal",
      description:
        "Carries out a proposal the agent prepared (a `act_…` id from its reply). This changes the brand's live " +
        "data: get the person's go-ahead first. Edits: for create_pins, `keep` limits it to some place keys and " +
        "`defaults` changes dates, type, radius and limits; for creating a hotspot, event or announcement, `draft` " +
        "changes fields of the draft. A rejected edit can be fixed and confirmed again.",
      inputSchema: { actionId: z.string(), ...ActionEditsInput.shape, brandId },
      annotations: { destructiveHint: true },
    },
    ({ actionId, keep, defaults, draft, brandId }) =>
      safely(async () => {
        const result = await agent.confirm({
          actionId,
          creatorId: brandId,
          edits: { keep, defaults, draft },
        });
        return text(
          result.message +
            (result.pinJobId
              ? `\nPins are being created in the background: check with get_pin_job (jobId \`${result.pinJobId}\`).`
              : ""),
        );
      }),
  );

  server.registerTool(
    "cancel_proposal",
    {
      title: "Cancel a proposal",
      description: "Turns down a proposal; nothing is changed.",
      inputSchema: { actionId: z.string(), brandId },
      annotations: { idempotentHint: true },
    },
    ({ actionId, brandId }) =>
      safely(async () => {
        await agent.cancel({ actionId, creatorId: brandId });
        return text("Proposal cancelled.");
      }),
  );

  server.registerTool(
    "get_pin_job",
    {
      title: "Pin creation progress",
      description: "Progress of pins being created after a create_pins proposal was confirmed.",
      inputSchema: { jobId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ jobId }) =>
      safely(async () => {
        const job = await agent.pinJob({ jobId });
        return text(
          [
            `Status: ${job.status}, ${job.completed}/${job.total} done`,
            job.failed.length ? `Failed: ${job.failed.join(", ")}` : "",
            job.error ?? "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }),
  );

  return server;
}
