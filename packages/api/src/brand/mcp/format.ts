import type { ActionStatus, AgentBlock, ProposedAction } from "@wadzzo/agent-contract";

import type { AgentMessage } from "../routers/agent";

/**
 * The agent's replies as text an AI app can read and act on: the answer, then
 * each card (places, pins, reports, questions, proposals) with the ids the MCP
 * tools take.
 *
 * Collector names and emails are left out, as they are for the agent's own
 * model: only the brand sees them, in the portal.
 */

type Actions = Record<string, { status: ActionStatus; result: { message?: string } | null }>;

const MAX_ITEMS = 50;

const day = (iso: string) => iso.slice(0, 10);

function list<T>(items: T[], line: (item: T) => string) {
  const shown = items.slice(0, MAX_ITEMS).map((i) => `- ${line(i)}`);
  if (items.length > MAX_ITEMS) shown.push(`- … and ${items.length - MAX_ITEMS} more`);
  return shown.join("\n");
}

function describeAction(action: ProposedAction): string {
  switch (action.type) {
    case "create_pins": {
      const d = action.defaults;
      return [
        `Create pins at ${action.items.length} places (${d.grouping}), type ${d.type}, ${day(d.startDate)} → ${day(d.endDate)}, ` +
          `${d.pinNumber} per place, radius ${d.radius} m, collection limit ${d.collectionLimit}, auto-collect ${d.autoCollect ? "on" : "off"}${d.look ? `, pin shape ${d.look.shape}` : ""}.`,
        list(action.items, (p) => `\`${p.key}\` ${p.title}${p.address ? `, ${p.address}` : ""}`),
      ].join("\n");
    }
    case "update_pins":
      return `Update ${action.pins.length} pins (${action.pins.map((p) => p.title).join(", ")}): ${JSON.stringify(action.changes)}`;
    case "hide_pins":
      return `Hide ${action.pins.length} pins: ${action.pins.map((p) => p.title).join(", ")}`;
    case "hotspot_state":
      return `${action.op} hotspot “${action.hotspot.title}”`;
    case "update_hotspot":
      return `Update hotspot “${action.hotspot.title}”: ${JSON.stringify(action.changes)}`;
    case "create_hotspot":
    case "create_event":
    case "create_announcement": {
      const draft =
        action.type === "create_hotspot"
          ? action.hotspot
          : action.type === "create_event"
            ? action.event
            : action.announcement;
      return `${action.type.replace("_", " ")}: ${JSON.stringify(draft)}`;
    }
    case "update_event":
      return `Update event “${action.event.title}”: ${JSON.stringify(action.changes)}`;
    case "delete_event":
      return `Delete event “${action.event.title}”`;
    case "update_announcement":
      return `Update announcement “${action.announcement.title}”: ${JSON.stringify(action.changes)}`;
    case "delete_announcement":
      return `Delete announcement “${action.announcement.title}”`;
  }
}

export function formatBlock(block: AgentBlock, messageId: string, actions: Actions): string {
  switch (block.kind) {
    case "choices":
      return [
        `**Question:** ${block.question}${block.multiple ? " (pick one or more)" : ""}`,
        list(block.options, (o) => `${o.label}${o.description ? ` — ${o.description}` : ""}`),
        block.answered
          ? `Answered: ${block.answered.join(", ")}`
          : `To answer, call ask_agent with your answer as text and answer = { messageId: "${messageId}", blockId: "${block.id}", labels: [the option labels picked] }.` +
            (block.allowOther ? " A free-text answer is fine too." : ""),
      ].join("\n");
    case "places":
      return [
        `**${block.title}**${block.area ? ` (${block.area})` : ""}: ${block.items.length} places`,
        list(
          block.items,
          (p) =>
            `\`${p.key}\` ${p.title}${p.address ? `, ${p.address}` : ""} (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})` +
            (p.kind === "event" && p.startDate ? `, ${day(p.startDate)}` : "") +
            (p.alreadyPinned ? " — already pinned" : ""),
        ),
      ].join("\n");
    case "pins":
      return [
        `**${block.title}**: ${block.items.length} pins`,
        list(
          block.items,
          (p) =>
            `\`${p.id}\` ${p.title} [${p.type}, ${p.status}] ${day(p.startDate)} → ${day(p.endDate)}, collected ${p.collected}`,
        ),
      ].join("\n");
    case "hotspots":
      return [
        `**${block.title}**: ${block.items.length} hotspots`,
        list(
          block.items,
          (h) =>
            `\`${h.id}\` ${h.title} [${h.isActive ? "active" : "paused"}] drops every ${h.dropEveryDays} d, ${h.drops} drops, ${day(h.startDate)} → ${day(h.endDate)}`,
        ),
      ].join("\n");
    case "events":
      return [
        `**${block.title}**: ${block.items.length} events`,
        list(
          block.items,
          (e) =>
            `\`${e.id}\` ${e.title}, ${day(e.startDate)} → ${day(e.endDate)}${e.venueName ? ` at ${e.venueName}` : ""}, ${e.rsvps} RSVPs`,
        ),
      ].join("\n");
    case "announcements":
      return [
        `**${block.title}**: ${block.items.length} announcements`,
        list(
          block.items,
          (a) =>
            `\`${a.id}\` ${a.title}${a.pinned ? " (pinned)" : ""}, posted ${day(a.createdAt)}, ${a.comments} comments`,
        ),
      ].join("\n");
    case "collectors":
      return `**${block.title}**: ${block.total} collectors. Names and emails are only shown in the brand portal.`;
    case "report":
      return [
        `**${block.title}**`,
        list(block.stats, (s) => `${s.label}: ${s.value}${s.hint ? ` (${s.hint})` : ""}`),
        block.bars
          ? `${block.bars.title}:\n${list(block.bars.items, (b) => `${b.label}: ${b.value}`)}`
          : "",
        block.note ?? "",
      ]
        .filter(Boolean)
        .join("\n");
    case "proposal": {
      const state = actions[block.actionId];
      const status = state?.status ?? "pending";
      const outcome = state?.result?.message ? ` — ${state.result.message}` : "";
      return [
        `**Proposal \`${block.actionId}\`** [${status}${outcome}]: ${block.summary}`,
        describeAction(block.action),
        status === "pending"
          ? "Nothing changes until it's confirmed: confirm_proposal (optionally with edits) or cancel_proposal. Ask the person first."
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
  }
}

export function formatMessage(message: AgentMessage, actions: Actions): string {
  const who = message.role === "assistant" ? "Agent" : "You";
  const blocks = message.blocks.map((b) => formatBlock(b, message.id, actions));
  return [`### ${who} (message \`${message.id}\`)`, message.text, ...blocks]
    .filter(Boolean)
    .join("\n\n");
}
