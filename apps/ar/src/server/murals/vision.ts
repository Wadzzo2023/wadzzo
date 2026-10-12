import { GoogleAuth } from "google-auth-library";

import { env } from "~/env";
import type { RejectCode } from "~/lib/murals/constants";
import { AppError, ErrorCodes } from "@wadzzo/errors";

/**
 * ── Cloud Vision ───────────────────────────────────────────────────────────
 *
 * The paid half of the server check (plan §3.3 steps 6–7), called once per
 * completed sweep and only after every free check has passed. Two tiers so
 * junk is turned away for the price of one feature:
 *
 *   tier 1  centre frame: LABEL + SAFE_SEARCH        (~$0.0015)
 *   tier 2  3 frames: OBJECT_LOCALIZATION, centre: WEB_DETECTION  (~$0.017)
 *
 * Plain REST with google-auth-library rather than @google-cloud/vision: two
 * calls don't justify the client's dependency tree.
 *
 * Without GOOGLE_VISION_CREDENTIALS the checks are skipped outside
 * production (so the flow can be tried end to end on a laptop) and refused
 * in production.
 *
 * Thresholds below are first guesses; tune them against real scans
 * (MuralScan.vision keeps every raw response).
 */

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

/** Strong evidence on its own. */
const STREET_ART_LABELS = ["mural", "street art", "graffiti"];
/** Weaker art labels; only count together with a good CLIP score. */
const ART_LABELS = ["painting", "visual arts", "art", "modern art", "illustration", "artwork", "paint"];
const STREET_ART_MIN = 0.5;
const ART_MIN = 0.75;

const SCREEN_OBJECTS = ["laptop", "computer monitor", "television", "mobile phone", "tablet computer", "computer", "display device"];
const SCREEN_MIN_SCORE = 0.5;
/** Share of the frame a screen's box must cover to count. */
const SCREEN_MIN_AREA = 0.15;

const UNSAFE = new Set(["LIKELY", "VERY_LIKELY"]);

type Likelihood = "UNKNOWN" | "VERY_UNLIKELY" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "VERY_LIKELY";
type Vertex = { x?: number; y?: number };
type AnnotateResponse = {
  labelAnnotations?: { description: string; score: number }[];
  safeSearchAnnotation?: { adult: Likelihood; violence: Likelihood; racy: Likelihood };
  localizedObjectAnnotations?: { name: string; score: number; boundingPoly: { normalizedVertices: Vertex[] } }[];
  webDetection?: { fullMatchingImages?: { url: string }[]; partialMatchingImages?: { url: string }[] };
  error?: { message: string };
};

export type VisionReport = {
  skipped?: boolean;
  units: number;
  labels?: { description: string; score: number }[];
  safeSearch?: AnnotateResponse["safeSearchAnnotation"];
  screens?: { frame: number; name: string; score: number; area: number }[];
  webFullMatches?: number;
};

let auth: GoogleAuth | null = null;
function client() {
  if (!env.GOOGLE_VISION_CREDENTIALS) return null;
  auth ??= new GoogleAuth({
    credentials: JSON.parse(env.GOOGLE_VISION_CREDENTIALS) as Record<string, string>,
    scopes: ["https://www.googleapis.com/auth/cloud-vision"],
  });
  return auth;
}

async function annotate(requests: { image: { content: string }; features: { type: string; maxResults?: number }[] }[]) {
  const c = client()!;
  const res = await c.request<{ responses: AnnotateResponse[] }>({ url: ENDPOINT, method: "POST", data: { requests } });
  for (const r of res.data.responses) if (r.error) throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, { message: `Cloud Vision: ${r.error.message}` });
  return res.data.responses;
}

const b64 = (b: Buffer) => b.toString("base64");

function boxArea(v: Vertex[]) {
  const xs = v.map((p) => p.x ?? 0);
  const ys = v.map((p) => p.y ?? 0);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

/**
 * Runs both tiers, stopping early on the first reject. `clipScore` is the
 * server's own zero-shot score for the centre frame.
 */
export async function checkWithVision(
  frames: Buffer[],
  clipScore: number,
): Promise<{ ok: true; report: VisionReport } | { ok: false; code: RejectCode; report: VisionReport }> {
  if (!client()) {
    if (process.env.NODE_ENV === "production") throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "GOOGLE_VISION_CREDENTIALS is not set" });
    return { ok: true, report: { skipped: true, units: 0 } };
  }
  const centre = frames[1]!;

  // ── Tier 1 ──────────────────────────────────────────────────────────────
  const [t1] = await annotate([
    { image: { content: b64(centre) }, features: [{ type: "LABEL_DETECTION", maxResults: 25 }, { type: "SAFE_SEARCH_DETECTION" }] },
  ]);
  const labels = (t1!.labelAnnotations ?? []).map(({ description, score }) => ({ description, score }));
  const report: VisionReport = { units: 1, labels, safeSearch: t1!.safeSearchAnnotation };

  const s = t1!.safeSearchAnnotation;
  if (s && (UNSAFE.has(s.adult) || UNSAFE.has(s.violence) || UNSAFE.has(s.racy))) {
    return { ok: false, code: "UNSAFE", report };
  }
  const has = (names: string[], min: number) => labels.some((l) => names.includes(l.description.toLowerCase()) && l.score >= min);
  const isArt = has(STREET_ART_LABELS, STREET_ART_MIN) || (has(ART_LABELS, ART_MIN) && clipScore >= 0.5);
  if (!isArt) return { ok: false, code: "NOT_ART", report };

  // ── Tier 2 ──────────────────────────────────────────────────────────────
  const t2 = await annotate([
    ...frames.map((f, i) => ({
      image: { content: b64(f) },
      features: [{ type: "OBJECT_LOCALIZATION", maxResults: 15 }, ...(i === 1 ? [{ type: "WEB_DETECTION", maxResults: 5 }] : [])],
    })),
  ]);
  report.units += frames.length + 1;
  report.screens = t2.flatMap((r, frame) =>
    (r.localizedObjectAnnotations ?? [])
      .filter((o) => SCREEN_OBJECTS.includes(o.name.toLowerCase()))
      .map((o) => ({ frame, name: o.name, score: o.score, area: boxArea(o.boundingPoly.normalizedVertices) })),
  );
  report.webFullMatches = t2[1]?.webDetection?.fullMatchingImages?.length ?? 0;

  if (report.screens.some((o) => o.score >= SCREEN_MIN_SCORE && o.area >= SCREEN_MIN_AREA)) {
    return { ok: false, code: "SCREEN", report };
  }
  if (report.webFullMatches > 0) return { ok: false, code: "WEB_COPY", report };
  return { ok: true, report };
}
