import PROMPTS from "./prompts.s0.json";

/**
 * ── Mural score ────────────────────────────────────────────────────────────
 *
 * Zero-shot "is this street art" from a normalised MobileCLIP S0 image
 * embedding, against the precomputed prompt embeddings. Shared verbatim by
 * the browser detector and the server pipeline so both sides agree.
 */

const POS = PROMPTS.positive.length;
const LABELS = [...PROMPTS.positive, ...PROMPTS.negative];

export const dot = (a: number[], b: number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
};

/** Probability mass on the positive prompts, plus the single best label. */
export function muralScore(embedding: number[]) {
  const logits = PROMPTS.embeddings.map((t) => 100 * dot(embedding, t));
  const max = Math.max(...logits);
  const exp = logits.map((l) => Math.exp(l - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  const p = exp.map((e) => e / sum);
  return {
    score: p.slice(0, POS).reduce((a, b) => a + b, 0),
    top: LABELS[p.indexOf(Math.max(...p))]!,
  };
}

/** Best cosine similarity between any of `a` and any of `b`. */
export function bestSimilarity(a: number[][], b: number[][]) {
  let best = -1;
  for (const x of a) for (const y of b) best = Math.max(best, dot(x, y));
  return best;
}
