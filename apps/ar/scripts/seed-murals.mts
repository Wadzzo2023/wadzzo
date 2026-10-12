/**
 * ── Murals seed (dev only) ─────────────────────────────────────────────────
 *
 *   pnpm seed:murals            # create / refresh the seed
 *   pnpm seed:murals --clear    # remove everything it created
 *
 * Seeds ~20 murals around a centre point (default: the dev location below),
 * covering every status — DISCOVERED (1–2 finders), PENDING (3+), APPROVED,
 * REJECTED (not a mural / fraud) — with seed finder accounts, scans,
 * discovery ranks, Wadzzo Coins ledger + balances, real MobileCLIP
 * embeddings, and some rejected attempts for Admin › Insights. Your own
 * account (id starting with SEED_ME, default GCMT…) gets scans + coins so
 * Collection › Murals and /coins aren't empty.
 *
 * Photos: real street murals / graffiti from Wikimedia Commons categories
 * (Bangladesh first, then India), free licences only — CC0 / PD / CC BY /
 * CC BY-SA, with author + licence kept in the S3 manifest and each scan's
 * `vision.credit`. Uploaded once to S3 under `murals/seed/` with three crops
 * each for the sweep keyframes.
 *
 * Everything it writes has a `seed_` id prefix, so `--clear` removes exactly
 * that and recomputes the affected balances. Refuses to run against a
 * production-looking DATABASE_URL.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const sharp = require("sharp");
const tzLookup = require("@photostructure/tz-lookup");

const CENTER = { lat: Number(process.env.SEED_LAT ?? 23.939691517433474), lng: Number(process.env.SEED_LNG ?? 90.29789026263893) };
const ME_PREFIX = process.env.SEED_ME ?? "GCMT";
const COUNT = 20;
const CLEAR = process.argv.includes("--clear");

if (/18\.223\.84\.184|prod/i.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing: DATABASE_URL looks like production.");
  process.exit(1);
}

const db = new PrismaClient();
const BUCKET = process.env.NEXT_AWS_BUCKET_NAME!;
const s3 = new S3Client({
  region: process.env.NEXT_AWS_BUCKET_REGION,
  credentials: { accessKeyId: process.env.NEXT_AWS_ACCESS_KEY!, secretAccessKey: process.env.NEXT_AWS_SECRET_ACCESS_KEY! },
});
const publicUrl = (key: string) => `https://${BUCKET}.s3.amazonaws.com/${key}`;

// ── deterministic randomness ────────────────────────────────────────────────
let seed = 20261005;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]!;

// ── clear ───────────────────────────────────────────────────────────────────
async function clear() {
  const affected = new Set<string>(
    (await db.coinLedger.findMany({ where: { id: { startsWith: "seed_" } }, select: { userId: true }, distinct: ["userId"] })).map((r: { userId: string }) => r.userId),
  );
  await db.coinLedger.deleteMany({ where: { id: { startsWith: "seed_" } } });
  await db.muralScanSession.deleteMany({ where: { id: { startsWith: "seed_" } } });
  await db.mural.updateMany({ where: { id: { startsWith: "seed_" } }, data: { mergedIntoId: null } });
  await db.mural.deleteMany({ where: { id: { startsWith: "seed_" } } }); // cascades scans + embeddings
  await db.coinBalance.deleteMany({ where: { userId: { startsWith: "seed_" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "seed_" } } });
  // Balances = what's left in the ledger.
  for (const userId of affected) {
    if (userId.startsWith("seed_")) continue;
    const sum = await db.coinLedger.aggregate({ where: { userId }, _sum: { amount: true } });
    await db.coinBalance.upsert({ where: { userId }, update: { balance: Math.max(0, sum._sum.amount ?? 0) }, create: { userId, balance: Math.max(0, sum._sum.amount ?? 0) } });
  }
  console.log("Cleared murals seed.");
}

// ── photos (Commons street art, Bangladesh first) → S3, cached via manifest ─
type Photo = { key: string; frames: string[]; source: string; license: string; author: string; title: string };
const MANIFEST = "murals/seed/manifest.v2.json";

async function s3Json<T>(key: string): Promise<T | null> {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return JSON.parse(await r.Body.transformToString()) as T;
  } catch {
    return null;
  }
}

const stripHtml = (h: string) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function commonsPhotos(): Promise<Photo[]> {
  const cached = await s3Json<Photo[]>(MANIFEST);
  if (cached && cached.length >= COUNT) return cached;

  const UA = { "User-Agent": "wadzzo-seed/1.0 (support@wadzzo.com)" };
  // Real street walls, nearest region first. Free licences only; BY / BY-SA
  // authors are kept in the manifest + each scan's `vision.credit`.
  const categories = ["Murals in Bangladesh", "Graffiti in Dhaka", "Graffiti in Bangladesh", "Street art in Bangladesh", "Graffiti in India", "Street art in India", "Murals in India"];
  const seen = new Set<string>();
  const found: { url: string; page: string; license: string; author: string; title: string }[] = [];
  for (const cat of categories) {
    if (found.length >= COUNT + 4) break;
    const u = new URL("https://commons.wikimedia.org/w/api.php");
    u.search = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "categorymembers",
      gcmtitle: `Category:${cat}`,
      gcmtype: "file",
      gcmlimit: "200",
      prop: "imageinfo",
      iiprop: "url|mime|size|extmetadata",
      iiurlwidth: "1280",
    }).toString();
    const d = (await (await fetch(u, { headers: UA })).json()) as { query?: { pages?: Record<string, { title: string; imageinfo?: { mime: string; width: number; height: number; thumburl?: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }> } };
    const pages = Object.values(d.query?.pages ?? {}).sort((x, y) => x.title.localeCompare(y.title));
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      const lic = ii?.extmetadata?.LicenseShortName?.value ?? "";
      if (!ii?.thumburl || ii.mime !== "image/jpeg" || ii.width < 900 || ii.width < ii.height * 0.9) continue;
      if (!/^(CC0|Public domain|PD|CC BY(-SA)? [\d.]+)/i.test(lic)) continue;
      // One photo per wall: series like "Foo 1.jpg", "Foo (2).jpg" collapse.
      const stem = p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/[\s_(-]*\d+\)?$/, "").toLowerCase();
      if (seen.has(stem)) continue;
      seen.add(stem);
      found.push({ url: ii.thumburl, page: ii.descriptionurl, license: lic, author: stripHtml(ii.extmetadata?.Artist?.value ?? "Unknown"), title: p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "") });
      if (found.length >= COUNT + 4) break;
    }
  }
  if (found.length < COUNT) throw new Error(`Only ${found.length} usable street-art photos found`);

  const photos: Photo[] = [];
  for (const [i, f] of found.slice(0, COUNT).entries()) {
    const buf = Buffer.from(await (await fetch(f.url, { headers: UA })).arrayBuffer());
    const img = sharp(buf).rotate();
    const meta = await img.metadata();
    const W = meta.width!;
    const H = meta.height!;
    // Three overlapping crops ≈ what a left / centre / right sweep would see.
    const cw = Math.round(W * 0.8);
    const frames: string[] = [];
    for (const [j, left] of [0, Math.round((W - cw) / 2), W - cw].entries()) {
      const out = await sharp(buf).rotate().extract({ left, top: 0, width: cw, height: H }).resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      const key = `murals/seed/${String(i).padStart(2, "0")}-${j}.jpg`;
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: out, ContentType: "image/jpeg", CacheControl: "public, max-age=31536000" }));
      frames.push(publicUrl(key));
    }
    photos.push({ key: `murals/seed/${String(i).padStart(2, "0")}`, frames: [frames[0]!, frames[1]!, frames[2]!], source: f.page, license: f.license, author: f.author, title: f.title });
    process.stdout.write(`\r  photos ${i + 1}/${COUNT}`);
  }
  console.log();
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: MANIFEST, Body: JSON.stringify(photos, null, 2), ContentType: "application/json" }));
  return photos;
}

// ── embeddings (same model + weights as the app) ────────────────────────────
async function embedder() {
  const tjs = require("@huggingface/transformers");
  const [proc, model] = await Promise.all([
    tjs.AutoProcessor.from_pretrained("Xenova/mobileclip_s0"),
    tjs.CLIPVisionModelWithProjection.from_pretrained("Xenova/mobileclip_s0", { dtype: "fp16" }),
  ]);
  return async (url: string): Promise<number[]> => {
    const img = await tjs.RawImage.fromURL(url);
    const { image_embeds } = await model(await proc(img));
    return image_embeds.normalize().tolist()[0];
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────
function around(i: number) {
  // Spread in rings 250 m – 1.8 km, evenly-ish by angle.
  const ang = (i / COUNT) * Math.PI * 2 + rand() * 0.6;
  const r = 250 + rand() * 1550;
  return { lat: CENTER.lat + (r * Math.cos(ang)) / 111_320, lng: CENTER.lng + (r * Math.sin(ang)) / (111_320 * Math.cos((CENTER.lat * Math.PI) / 180)) };
}

async function autoTitle(lat: number, lng: number) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_API;
  if (!token) return "Street art";
  try {
    const u = new URL("https://api.mapbox.com/search/geocode/v6/reverse");
    u.search = new URLSearchParams({ longitude: String(lng), latitude: String(lat), types: "address,street,neighborhood,place", limit: "1", access_token: token }).toString();
    const d = (await (await fetch(u)).json()) as { features?: { properties?: { name?: string; feature_type?: string; context?: { street?: { name?: string }; neighborhood?: { name?: string }; place?: { name?: string } } } }[] };
    const p = d.features?.[0]?.properties;
    const street = p?.context?.street?.name ?? (p?.feature_type === "street" ? p.name : undefined);
    if (street) return `Mural on ${street}`;
    const area = p?.context?.neighborhood?.name ?? p?.context?.place?.name;
    return area ? `Mural in ${area}` : "Street art";
  } catch {
    return "Street art";
  }
}

const localDay = (tz: string, at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

const NAMES = ["Rang Dhonu", "Blue Heron", "Monsoon Bloom", "Kite Festival", "River Song", "Tiger Wall", "Paper Boats", "Night Market", "Golden Jute", "Rickshaw Dreams"];
const ARTISTS = ["Shilpi Collective", "Arif R.", "Neon Lotus", "Unknown", "Dhaka Walls Crew"];

// ── seed ────────────────────────────────────────────────────────────────────
async function main() {
  await clear();
  if (CLEAR) return;

  const me = await db.user.findFirst({ where: { id: { startsWith: ME_PREFIX } }, select: { id: true } });
  if (!me) console.warn(`No user with id starting ${ME_PREFIX} — skipping "my account" scans.`);

  const settings = await db.muralSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const COIN = settings.coinsPerScan;
  const BONUS = settings.discoveryBonus;

  console.log("Photos…");
  const photos = await commonsPhotos();
  console.log("Embeddings…");
  const embed = await embedder();

  // Seed finders: two brand-new accounts (they trip the "new account" flag).
  const now = Date.now();
  const day = 86_400_000;
  const people = [
    { name: "seed_rafi", joined: 210 },
    { name: "seed_nadia", joined: 160 },
    { name: "seed_tanvir", joined: 95 },
    { name: "seed_mim", joined: 40 },
    { name: "seed_fresh_1", joined: 2 },
    { name: "seed_fresh_2", joined: 1 },
  ];
  const users: string[] = [];
  for (const [i, p] of people.entries()) {
    const id = `seed_user_${i}`;
    await db.user.create({ data: { id, name: p.name, email: `${p.name}@wadzzo.test`, joinedAt: new Date(now - p.joined * day) } });
    users.push(id);
  }

  // Status plan for the 20 murals.
  type Plan = { status: "DISCOVERED" | "PENDING" | "APPROVED" | "REJECTED"; reason?: "NOT_A_MURAL" | "FRAUD"; finders: number; named: boolean; mine?: "rank1" | "rank2" | "scan" | "limit" };
  const plan: Plan[] = [
    { status: "APPROVED", finders: 5, named: true, mine: "rank1" },
    { status: "APPROVED", finders: 4, named: true, mine: "limit" },
    { status: "APPROVED", finders: 6, named: true, mine: "scan" },
    { status: "APPROVED", finders: 3, named: true },
    { status: "APPROVED", finders: 4, named: false },
    { status: "APPROVED", finders: 3, named: true },
    { status: "APPROVED", finders: 5, named: false },
    { status: "APPROVED", finders: 3, named: true },
    { status: "PENDING", finders: 3, named: true, mine: "rank2" },
    { status: "PENDING", finders: 4, named: false },
    { status: "PENDING", finders: 3, named: false },
    { status: "PENDING", finders: 3, named: true },
    { status: "PENDING", finders: 3, named: false },
    { status: "DISCOVERED", finders: 1, named: false, mine: "rank1" },
    { status: "DISCOVERED", finders: 2, named: true },
    { status: "DISCOVERED", finders: 1, named: false },
    { status: "DISCOVERED", finders: 2, named: false },
    { status: "DISCOVERED", finders: 1, named: false },
    { status: "REJECTED", reason: "NOT_A_MURAL", finders: 3, named: false, mine: "scan" },
    { status: "REJECTED", reason: "FRAUD", finders: 3, named: false },
  ];

  const balances = new Map<string, number>();
  let led = 0;
  let sess = 0;
  const ledger = async (userId: string, amount: number, reason: string, muralId: string, scanId: string | null, note: string | null, at: Date) => {
    await db.coinLedger.create({ data: { id: `seed_led_${led++}`, userId, amount, reason, muralId, scanId, note, createdAt: at } });
    balances.set(userId, (balances.get(userId) ?? 0) + amount);
  };

  for (const [i, pl] of plan.entries()) {
    const ph = photos[i]!;
    const at = around(i);
    const tz = tzLookup(at.lat, at.lng) as string;
    const id = `seed_mural_${String(i).padStart(2, "0")}`;
    const title = await autoTitle(at.lat, at.lng);

    // Finders in order: mine first when I'm rank 1, second when rank 2.
    const pool = [...users].sort(() => rand() - 0.5);
    let finders = pool.slice(0, pl.finders);
    if (me && pl.mine === "rank1") finders = [me.id, ...pool.slice(0, pl.finders - 1)];
    if (me && pl.mine === "rank2") finders = [pool[0]!, me.id, ...pool.slice(1, pl.finders - 1)];
    if (me && (pl.mine === "scan" || pl.mine === "limit")) finders = [...pool.slice(0, pl.finders - 1), me.id];
    // The fraud mural: three fresh accounts confirming within minutes.
    if (pl.reason === "FRAUD") finders = [users[4]!, users[5]!, users[3]!];

    const created = new Date(now - (6 + rand() * 18) * day);
    await db.mural.create({
      data: {
        id,
        autoTitle: title,
        title: pl.named ? NAMES[i % NAMES.length] : null,
        artist: pl.named && rand() > 0.4 ? pick(ARTISTS) : null,
        namedById: pl.named ? finders[0] : null,
        latitude: at.lat,
        longitude: at.lng,
        coverUrl: ph.frames[1]!,
        status: pl.status,
        rejectReason: pl.reason ?? null,
        decidedAt: pl.status === "APPROVED" || pl.status === "REJECTED" ? new Date(now - 2 * day) : null,
        discovererId: finders[0]!,
        distinctScanners: finders.length,
        scanCount: 0,
        createdAt: created,
      },
    });
    await db.muralEmbedding.create({ data: { id: `seed_emb_${i}`, muralId: id, vector: await embed(ph.frames[1]!) } });

    let scanCount = 0;
    for (const [rankIdx, userId] of finders.entries()) {
      // Quick confirms for the fraud mural; spread over days otherwise.
      const when = pl.reason === "FRAUD" ? new Date(created.getTime() + rankIdx * 70_000) : new Date(created.getTime() + rankIdx * (0.5 + rand() * 2) * day);
      const repeats = userId === me?.id && pl.mine === "limit" ? 0 : rand() > 0.7 ? 1 : 0;
      for (let k = 0; k <= repeats; k++) {
        const t = new Date(when.getTime() + k * 1.3 * day);
        if (t.getTime() > now) continue;
        const rank = k === 0 && rankIdx < settings.confirmationsNeeded ? rankIdx + 1 : null;
        const scanId = `seed_scan_${i}_${rankIdx}_${k}`;
        await db.muralScan.create({
          data: {
            id: scanId,
            muralId: id,
            userId,
            latitude: at.lat + (rand() - 0.5) * 0.0002,
            longitude: at.lng + (rand() - 0.5) * 0.0002,
            accuracyM: 6 + rand() * 18,
            timeZone: tz,
            localDay: localDay(tz, t),
            keyframes: ph.frames,
            vision: { seed: true, credit: { source: ph.source, license: ph.license, author: ph.author, title: ph.title }, labels: [{ description: "Mural", score: 0.9 }, { description: "Street art", score: 0.84 }], clip: [{ score: 0.97 }, { score: 0.99 }, { score: 0.96 }] },
            platform: pick(["web", "ios", "android"]),
            discoveryRank: rank,
            coinsAwarded: COIN + (rank ? BONUS : 0),
            createdAt: t,
          },
        });
        await db.muralScanSession.create({ data: { id: `seed_sess_${sess++}`, userId, latitude: at.lat, longitude: at.lng, accuracyM: 12, frameKeys: [], startedAt: t, finishedAt: new Date(t.getTime() + 9000), outcome: "accepted", scanId, costUnits: 5 } });
        await ledger(userId, COIN, "MURAL_SCAN", id, scanId, null, t);
        if (rank) await ledger(userId, BONUS, "MURAL_DISCOVERY", id, scanId, `Discoverer #${rank}`, t);
        scanCount++;
      }
    }

    // "At today's limit": three scans today by me.
    if (me && pl.mine === "limit") {
      for (let k = 0; k < settings.dailyScansPerMural; k++) {
        const t = new Date(now - (3 - k) * 3600_000);
        const scanId = `seed_scan_${i}_me_today_${k}`;
        await db.muralScan.create({
          data: { id: scanId, muralId: id, userId: me.id, latitude: at.lat, longitude: at.lng, accuracyM: 9, timeZone: tz, localDay: localDay(tz, new Date()), keyframes: ph.frames, vision: { seed: true }, platform: "web", discoveryRank: null, coinsAwarded: COIN, createdAt: t },
        });
        await ledger(me.id, COIN, "MURAL_SCAN", id, scanId, null, t);
        scanCount++;
      }
    }

    // Fraud: coins taken back.
    if (pl.reason === "FRAUD") {
      for (const userId of finders) {
        const earned = (await db.coinLedger.aggregate({ where: { userId, muralId: id }, _sum: { amount: true } }))._sum.amount ?? 0;
        if (earned > 0) await ledger(userId, -earned, "MURAL_REVOKE", id, null, "Rejected as fraud", new Date(now - 2 * day));
      }
    }

    await db.mural.update({ where: { id }, data: { scanCount } });
    process.stdout.write(`\r  murals ${i + 1}/${COUNT}`);
  }
  console.log();

  // Rejected attempts, for Admin › Insights.
  const codes = ["NOT_ART", "NOT_ART", "NOT_ART", "NO_SWEEP", "NO_SWEEP", "SCREEN", "SCREEN", "GPS_WEAK", "DAILY_LIMIT", "WEB_COPY"];
  for (let k = 0; k < 34; k++) {
    const t = new Date(now - rand() * 20 * day);
    const outcome = pick(codes);
    await db.muralScanSession.create({
      data: { id: `seed_sess_${sess++}`, userId: pick(users), latitude: CENTER.lat, longitude: CENTER.lng, accuracyM: 20, frameKeys: [], startedAt: t, finishedAt: t, outcome, costUnits: outcome === "NOT_ART" ? 1 : outcome === "SCREEN" || outcome === "WEB_COPY" ? 5 : 0 },
    });
  }

  // Balances = ledger totals (never below 0).
  for (const [userId] of balances) {
    const sum = await db.coinLedger.aggregate({ where: { userId }, _sum: { amount: true } });
    const balance = Math.max(0, sum._sum.amount ?? 0);
    await db.coinBalance.upsert({ where: { userId }, update: { balance }, create: { userId, balance } });
  }

  const mine = me ? (await db.coinBalance.findUnique({ where: { userId: me.id } }))?.balance : null;
  console.log(`Seeded ${COUNT} murals, ${users.length} finders, ${led} ledger rows, ${sess} scan sessions.${me ? ` Your balance: ${mine} coins.` : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
