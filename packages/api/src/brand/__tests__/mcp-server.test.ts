import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Platform } from "@wadzzo/db";

vi.mock("@wadzzo/auth", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("@wadzzo/db/server", () => ({ db: {} }));
vi.mock("../../env", () => ({ env: { PLATFORM_SLUG: "wadzzo" } }));

// The MCP tools only call the agent router, so a stand-in router is enough to
// check what they send it and what they make of its answers.
const agent = {
  overview: vi.fn(),
  send: vi.fn(),
  poll: vi.fn(),
  conversation: vi.fn(),
  conversations: vi.fn(),
  deleteConversation: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  pinJob: vi.fn(),
};
vi.mock("../routers/agent", async () => {
  const { z } = await import("zod");
  const { createTRPCRouter, publicProcedure } = await import("../trpc");
  const q = (fn: (input: unknown) => unknown) =>
    publicProcedure.input(z.any()).query(({ input }) => fn(input));
  const m = (fn: (input: unknown) => unknown) =>
    publicProcedure.input(z.any()).mutation(({ input }) => fn(input));
  return {
    agentRouter: createTRPCRouter({
      overview: q((i) => agent.overview(i)),
      send: m((i) => agent.send(i)),
      poll: q((i) => agent.poll(i)),
      conversation: q((i) => agent.conversation(i)),
      conversations: q((i) => agent.conversations(i)),
      deleteConversation: m((i) => agent.deleteConversation(i)),
      confirm: m((i) => agent.confirm(i)),
      cancel: m((i) => agent.cancel(i)),
      pinJob: q((i) => agent.pinJob(i)),
    }),
  };
});

const { createMcpServer } = await import("../mcp/server");
const { AppError, ErrorCodes } = await import("@wadzzo/errors");

const PLATFORM = { id: "wadzzo", name: "Wadzzo", isRoot: true } as Platform;
const SESSION = {
  user: { id: "BRAND", walletType: "emailPass", emailVerified: true },
  expires: "9999-12-31T23:59:59.000Z",
} as Session;

async function connect() {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(SESSION, PLATFORM).connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}

const textOf = (r: Awaited<ReturnType<Client["callTool"]>>) =>
  (r.content as { type: string; text: string }[]).map((c) => c.text).join("\n");

const REPLY = {
  id: "msg_2",
  role: "assistant" as const,
  text: "I found 2 parks and prepared pins for them.",
  createdAt: new Date(),
  steps: [],
  blocks: [
    {
      kind: "places",
      id: "places_1",
      title: "Parks",
      items: [
        { key: "p1", title: "Eagle Point Park", lat: 41.85, lng: -90.19, kind: "place" },
        { key: "p2", title: "Riverview Park", lat: 41.84, lng: -90.18, kind: "place" },
      ],
    },
    {
      kind: "proposal",
      id: "prop_1",
      actionId: "act_1",
      summary: "Create 2 pins",
      action: {
        type: "create_pins",
        items: [],
        defaults: {
          type: "LANDMARK",
          startDate: "2026-11-01",
          endDate: "2026-12-01",
          autoCollect: false,
          pinNumber: 1,
          radius: 50,
          collectionLimit: 100,
          grouping: "per-location",
        },
      },
    },
    {
      kind: "collectors",
      id: "collectors_1",
      title: "Top collectors",
      total: 1,
      items: [{ name: "Fan", email: "fan@example.com", collected: 3, redeemed: 0, lastAt: "" }],
    },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe("MCP server", () => {
  it("lists the agent's tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "ask_agent",
      "cancel_proposal",
      "confirm_proposal",
      "delete_conversation",
      "get_brand",
      "get_conversation",
      "get_pin_job",
      "get_reply",
      "list_conversations",
    ]);
    expect(tools.find((t) => t.name === "confirm_proposal")?.annotations?.destructiveHint).toBe(
      true,
    );
  });

  it("ask_agent sends the message, waits for the run and shows the reply's cards", async () => {
    agent.send.mockResolvedValue({ conversationId: "conv_1", jobId: "job_1" });
    agent.poll
      .mockResolvedValueOnce({ status: "processing", steps: [], message: null })
      .mockResolvedValueOnce({ status: "completed", steps: [], message: REPLY });
    agent.conversation.mockResolvedValue({
      actions: { act_1: { status: "pending", result: null } },
    });

    const client = await connect();
    const out = textOf(
      await client.callTool({
        name: "ask_agent",
        arguments: { text: "Pin the parks", timeZone: "America/Chicago" },
      }),
    );

    expect(agent.send).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Pin the parks",
        timeZone: "America/Chicago",
        creatorId: undefined,
      }),
    );
    expect(out).toContain("Conversation `conv_1`");
    expect(out).toContain("I found 2 parks");
    expect(out).toContain("`p1` Eagle Point Park");
    expect(out).toContain("**Proposal `act_1`** [pending]");
    expect(out).toContain("confirm_proposal");
    // Collector names and emails stay in the portal.
    expect(out).toContain("1 collectors");
    expect(out).not.toContain("fan@example.com");
  }, 10_000);

  it("confirm_proposal passes the edits and points to the pin job", async () => {
    agent.confirm.mockResolvedValue({
      status: "done",
      message: "Creating 1 pin…",
      pinJobId: "lgj_1",
    });
    const client = await connect();
    const out = textOf(
      await client.callTool({
        name: "confirm_proposal",
        arguments: { actionId: "act_1", keep: ["p1"], defaults: { radius: 80 } },
      }),
    );
    expect(agent.confirm).toHaveBeenCalledWith({
      actionId: "act_1",
      creatorId: undefined,
      edits: { keep: ["p1"], defaults: { radius: 80 }, draft: undefined },
    });
    expect(out).toContain("Creating 1 pin");
    expect(out).toContain("get_pin_job");
    expect(out).toContain("lgj_1");
  });

  it("turns access errors into tool errors the AI can read", async () => {
    agent.overview.mockRejectedValue(
      new AppError(ErrorCodes.AUTH_NOT_A_CREATOR, {
        message: "Creator access requires an approved brand account",
      }),
    );
    const client = await connect();
    const result = await client.callTool({ name: "get_brand", arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("approved brand account");
  });

  it("rejects a confirm with edits the app wouldn't accept", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "confirm_proposal",
      arguments: { actionId: "act_1", defaults: { radius: 99_999 } },
    });
    expect(result.isError).toBe(true);
    expect(agent.confirm).not.toHaveBeenCalled();
  });
});
