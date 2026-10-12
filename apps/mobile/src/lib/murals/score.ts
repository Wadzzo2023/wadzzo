import PROMPTS from "./prompts.s0.json";

/**
 * ── Mural score ────────────────────────────────────────────────────────────
 *
 * Same maths as wadzzoAR `src/lib/murals/score.ts`, marked as worklets so the
 * VisionCamera frame processor can score on the camera thread without a hop.
 */

const POS = PROMPTS.positive.length;
const TEXT = PROMPTS.embeddings;
const LABELS = [...PROMPTS.positive, ...PROMPTS.negative];

export function dot(a: ArrayLike<number>, b: ArrayLike<number>) {
  "worklet";
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** Probability mass on the positive prompts, plus the single best label. */
export function muralScore(embedding: ArrayLike<number>) {
  "worklet";
  let max = -Infinity;
  const logits: number[] = [];
  for (let t = 0; t < TEXT.length; t++) {
    const l = 100 * dot(embedding, TEXT[t]!);
    logits.push(l);
    if (l > max) max = l;
  }
  let sum = 0;
  let pos = 0;
  let best = 0;
  for (let t = 0; t < logits.length; t++) {
    const e = Math.exp(logits[t]! - max);
    sum += e;
    if (t < POS) pos += e;
    if (logits[t]! > logits[best]!) best = t;
  }
  return { score: pos / sum, top: LABELS[best]! };
}

/** Best cosine similarity between `v` and any of `refs`. */
export function bestSimilarity(refs: number[][], v: ArrayLike<number>) {
  let best = -1;
  for (const r of refs) best = Math.max(best, dot(r, v));
  return best;
}
