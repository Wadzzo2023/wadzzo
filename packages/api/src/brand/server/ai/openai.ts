import OpenAI from "openai";

import { env } from "../../../env";
import { db } from "@wadzzo/db/server";
import { canAdminPlatform, getCurrentPlatform } from "@wadzzo/platform/server";
import { AppError, ErrorCodes } from "@wadzzo/errors";
import { isKnownError } from "@wadzzo/errors/trpc";

export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

/** Models are overridable per environment. */
export const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4-mini";
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";

/** Per brand, per UTC day. Admins aren't limited. */
export const AI_DAILY_LIMIT = { text: 50, image: 10 } as const;
export type AiKind = keyof typeof AI_DAILY_LIMIT;

type Usage = { day: string; text: number; image: number };
const today = () => new Date().toISOString().slice(0, 10);

function readUsage(extraFields: unknown): Usage {
  const u = (extraFields as { aiUsage?: Partial<Usage> } | null)?.aiUsage;
  if (u?.day !== today()) return { day: today(), text: 0, image: 0 };
  return { day: u.day, text: u.text ?? 0, image: u.image ?? 0 };
}

/** An admin of this deployment's platform (root-platform admins count everywhere). */
async function isAdmin(userId: string) {
  const [admin, platform] = await Promise.all([
    db.admin.findUnique({
      where: { id: userId },
      select: { platformId: true, platform: { select: { isRoot: true } } },
    }),
    getCurrentPlatform(),
  ]);
  return Boolean(admin && canAdminPlatform(admin, platform));
}

/** What's left today for this brand (null = unlimited). */
export async function aiRemaining(userId: string) {
  if (await isAdmin(userId))
    return {
      text: null,
      image: null,
      limit: AI_DAILY_LIMIT,
      unlimited: true as const,
    };
  const creator = await db.creator.findUnique({
    where: { id: userId },
    select: { extraFields: true },
  });
  const u = readUsage(creator?.extraFields);
  return {
    text: Math.max(0, AI_DAILY_LIMIT.text - u.text),
    image: Math.max(0, AI_DAILY_LIMIT.image - u.image),
    limit: AI_DAILY_LIMIT,
    unlimited: false as const,
  };
}

/**
 * Take one of today's generations in a single statement, so two requests at once can't both
 * pass the limit or lose each other's count. A new UTC day starts the counts again; other
 * extraFields keys are kept. False when the limit is reached.
 */
async function reserve(userId: string, kind: AiKind): Promise<boolean> {
  const day = today();
  const rows = await db.$executeRaw`
    UPDATE "Creator"
    SET "extraFields" = jsonb_set(
      COALESCE("extraFields", '{}'::jsonb),
      '{aiUsage}',
      CASE WHEN "extraFields"->'aiUsage'->>'day' = ${day}
        THEN jsonb_set(
          "extraFields"->'aiUsage',
          ARRAY[${kind}::text],
          to_jsonb(COALESCE(("extraFields"->'aiUsage'->>${kind}::text)::int, 0) + 1)
        )
        ELSE jsonb_build_object('day', ${day}::text, 'text', 0, 'image', 0)
          || jsonb_build_object(${kind}::text, 1)
      END
    )
    WHERE id = ${userId}
      AND (
        "extraFields"->'aiUsage'->>'day' IS DISTINCT FROM ${day}
        OR COALESCE(("extraFields"->'aiUsage'->>${kind}::text)::int, 0) < ${AI_DAILY_LIMIT[kind]}
      )`;
  return rows > 0;
}

/** Give back a reserved generation that failed (only if it is still the same day). */
async function refund(userId: string, kind: AiKind) {
  const day = today();
  await db.$executeRaw`
    UPDATE "Creator"
    SET "extraFields" = jsonb_set(
      "extraFields",
      ARRAY['aiUsage', ${kind}::text],
      to_jsonb(GREATEST(COALESCE(("extraFields"->'aiUsage'->>${kind}::text)::int, 0) - 1, 0))
    )
    WHERE id = ${userId} AND "extraFields"->'aiUsage'->>'day' = ${day}`;
}

/**
 * Run `work` if the brand has quota left; it only counts if it succeeds.
 * Usage lives in Creator.extraFields.aiUsage (no schema change; other keys kept).
 */
export async function withAiQuota<T>(
  userId: string,
  kind: AiKind,
  work: () => Promise<T>,
): Promise<T> {
  const counted = !(await isAdmin(userId));
  if (counted && !(await reserve(userId, kind)))
    throw new AppError(ErrorCodes.RATE_LIMITED, {
      message: `You've used today's ${AI_DAILY_LIMIT[kind]} AI ${kind === "image" ? "images" : "generations"}. It resets at midnight UTC.`,
    });

  try {
    return await work();
  } catch (e) {
    if (counted) await refund(userId, kind).catch((err) => console.error("[ai] refund", err));
    if (isKnownError(e)) throw e;
    console.error("[ai]", e);
    throw new AppError(ErrorCodes.AI_GENERATION_FAILED, {
      message:
        e instanceof OpenAI.APIError
          ? friendlyOpenAiError(e)
          : "The AI couldn't finish that. Try again.",
    });
  }
}

function friendlyOpenAiError(e: { status?: number; message: string }) {
  if (e.status === 400 && /safety|moderation|policy/i.test(e.message))
    return "That was blocked by the AI's safety filter. Try wording it differently.";
  if (e.status === 429) return "The AI is busy right now. Try again in a moment.";
  return "The AI couldn't finish that. Try again.";
}
