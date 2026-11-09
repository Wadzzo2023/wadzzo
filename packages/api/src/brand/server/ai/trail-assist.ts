// ✦ Assist in Trail mode (docs/trails/ai.md): a name, a description and one short clue per stop,
// written from the stops the brand chose. It only writes text; which pins are stops, their
// order and anything to do with collecting or rewards stay the brand's decision.

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { Db } from "@wadzzo/db";
import { AppError, ErrorCodes } from "@wadzzo/errors";
import { platformBranding } from "@wadzzo/platform/branding";
import { TRAIL_MODE_LABEL, type TrailMode } from "@wadzzo/schemas/trail";

import { openai, TEXT_MODEL, withAiQuota } from "./openai";

const answer = z.object({
  title: z.string().max(80),
  description: z.string().max(600),
  clues: z.array(z.string().max(200)),
});

export type TrailAssist = z.infer<typeof answer>;

export async function assistTrail(
  db: Db,
  userId: string,
  creatorId: string,
  input: { stops: { title: string; lat: number; lng: number }[]; mode: TrailMode; title?: string },
): Promise<TrailAssist> {
  const brand = await db.creator.findUnique({
    where: { id: creatorId },
    select: { name: true, bio: true },
  });
  const stops = input.stops
    .map((s, i) => `${i + 1}. ${s.title} (${s.lat.toFixed(5)}, ${s.lng.toFixed(5)})`)
    .join("\n");
  return withAiQuota(userId, "text", async () => {
    const res = await openai.responses.parse({
      model: TEXT_MODEL,
      input: [
        {
          role: "system",
          content: `You write the text for a brand's map trail on ${platformBranding.name}: fans ${TRAIL_MODE_LABEL[input.mode].toLowerCase()} from stop to stop and collect a digital item at each.
${brand ? `The brand is "${brand.name}"${brand.bio ? ` — ${brand.bio.slice(0, 300)}` : ""}.` : ""}
Return a short inviting trail name (under 60 characters), a two or three sentence description, and exactly one short clue per stop in order (a hint for finding it, under 120 characters).
Rules: write in the language the stop names are in; be specific, no filler, no hashtags or emoji; never invent prices, opening hours, addresses or rewards.`,
        },
        {
          role: "user",
          content: `${input.title?.trim() ? `Working name: ${input.title.trim()}\n` : ""}Stops in order:\n${stops}`,
        },
      ],
      text: { format: zodTextFormat(answer, "trail") },
    });
    if (!res.output_parsed)
      throw new AppError(ErrorCodes.AI_GENERATION_FAILED, {
        message: "✦ Assist couldn't write this one. Try again.",
      });
    const out = res.output_parsed;
    return { ...out, clues: out.clues.slice(0, input.stops.length) };
  });
}
