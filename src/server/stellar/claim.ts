import "server-only";

import { Asset, Operation, TransactionBuilder, type Keypair, type Transaction } from "@stellar/stellar-sdk";
import type { AssetTransaction, Platform } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { StellarAccount, toAsset, transactionSucceeded } from "~/lib/stellar/account";
import {
  BASE_RESERVE_XLM,
  PLATFORM_ASSET,
  PLATFORM_FEE,
  PLATFORM_FEE_XLM,
  TX_TIMEOUT_SECONDS,
  TrxBaseFee,
  TrxBaseFeeInPlatformAsset,
  networkPassphrase,
} from "~/lib/stellar/constant";
import { WithSing, type SignUserType } from "~/lib/stellar/custodial-sign";
import type { CostLine, Problem } from "~/lib/stellar/quote";
import type { Db } from "~/server/db";
import { inPlatformScope } from "~/server/platform-scope";

import { issuerKeypairFor, motherKeypair, platformStorageKeypair, storageKeypairFor } from "./keys";
import { xlmToPlatform } from "./prices";

/**
 * Claiming a collected pin's item into the collector's wallet.
 *
 * Collecting only records that someone found the pin. Claiming delivers the
 * item on-chain, lazily: the copy comes from the brand's storage when stock is
 * there, otherwise it's minted for this collector at that moment (while the
 * item's limit allows). The collector pays what it really costs — a platform
 * fee, the network fee, and the 0.5 XLM reserve if they don't hold the item
 * yet — and the quote shows all of it, and whether it will succeed, first.
 */
type Ctx = { db: Db; platform: Pick<Platform, "id" | "isRoot"> };
export type ClaimMethod = "PLATFORM_ASSET" | "XLM";

const amt = (n: number) => (Math.round(n * 1e7) / 1e7).toFixed(7);
const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;
const sum = (lines: CostLine[]) => lines.filter((l) => l.inTotal).reduce((s, l) => s + l.amount, 0);

/* ───────────────────────────── what's being claimed ───────────────────────────── */

async function load(ctx: Ctx, userId: string, consumerId: string) {
  const consumer = await ctx.db.locationConsumer.findUnique({
    where: { id: consumerId },
    select: {
      id: true,
      userId: true,
      claimTxId: true,
      location: {
        select: {
          locationGroup: {
            select: {
              id: true,
              title: true,
              platformId: true,
              asset: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  issuer: true,
                  thumbnail: true,
                  limit: true,
                  mintedCount: true,
                  creatorId: true,
                  creator: { select: { id: true, name: true, storagePub: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  const group = consumer?.location.locationGroup;
  if (consumer?.userId !== userId || !group || !inPlatformScope(ctx, group.platformId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Collected pin not found" });
  }
  return { consumer, group, asset: group.asset };
}
type Loaded = Awaited<ReturnType<typeof load>>;
type ClaimAsset = NonNullable<Loaded["asset"]>;

/** Copies held by unexpired PENDING transactions: minted ones count against supply, the rest against the brand's stock. */
async function pendingFor(db: Db, assetId: number) {
  const rows = await db.assetTransaction.findMany({
    where: { assetId, status: "PENDING", expiresAt: { gt: new Date() }, type: { in: ["PURCHASE", "CLAIM", "GIFT"] } },
    select: { minted: true, quantity: true },
  });
  return { minting: rows.reduce((s, r) => s + r.minted, 0), fromStock: rows.reduce((s, r) => s + (r.quantity - r.minted), 0) };
}

/** Where the copy comes from: the brand's stock first, then minting up to the item's limit. */
async function availability(ctx: Ctx, asset: ClaimAsset) {
  const pending = await pendingFor(ctx.db, asset.id);
  const stockAccount = asset.creator?.storagePub ?? platformStorageKeypair().publicKey();
  const storage = await StellarAccount.load(stockAccount);
  const stock = Math.max(0, Math.floor((storage?.tokenBalance(asset.code, asset.issuer) ?? 0) - pending.fromStock));

  let mintable = 0;
  const issuer = await issuerKeypairFor(ctx.db, asset);
  if (issuer) {
    mintable = asset.limit == null ? Infinity : Math.max(0, asset.limit - asset.mintedCount - pending.minting);
    if (mintable > 0 && !(await StellarAccount.load(issuer.publicKey()))) mintable = 0; // issuer not on-chain yet
  }
  const total = stock + mintable;
  return { stock, mintable, copiesLeft: total === Infinity ? null : total, available: total > 0, issuer };
}

/** Whether this collect already has a claim: delivered, or in flight. A failed or expired one can be retried. */
async function existingClaim(db: Db, claimTxId: string | null) {
  if (!claimTxId) return null;
  const tx = await db.assetTransaction.findUnique({ where: { id: claimTxId }, select: { status: true, expiresAt: true } });
  if (!tx) return null;
  if (tx.status === "SUCCESS") return "delivered" as const;
  if (tx.status === "PENDING" && (!tx.expiresAt || tx.expiresAt > new Date())) return "pending" as const;
  return null;
}

/* ──────────────────────────────────── quote ──────────────────────────────────── */

export type ClaimQuote = {
  method: ClaimMethod;
  item: { id: number; name: string; thumbnail: string; creator: string | null } | null;
  currency: string;
  lines: CostLine[];
  total: number;
  /** the collector's balance in `currency` */
  balance: number | null;
  /** from the brand's stock, or minted for this collector */
  source: "stock" | "mint" | null;
  needsTrustline: boolean;
  /** already in the wallet, or on its way */
  state: "available" | "delivered" | "pending";
  ok: boolean;
  problems: Problem[];
};

async function plan(ctx: Ctx, userId: string, consumerId: string, method: ClaimMethod) {
  const loaded = await load(ctx, userId, consumerId);
  const { asset, consumer } = loaded;
  const problems: Problem[] = [];

  const state = (await existingClaim(ctx.db, consumer.claimTxId)) ?? "available";
  if (!asset) {
    problems.push({ code: "NOT_FOR_SALE", message: "This pin has no item to claim." });
    return { loaded, quote: emptyQuote(method, state, problems), avail: null, buyer: null, feeSource: "buyer" as const, needsTrust: false, platformPay: 0 };
  }
  if (state === "delivered") problems.push({ code: "NOT_FOR_SALE", message: "This item is already in your wallet." });
  if (state === "pending") problems.push({ code: "NOT_FOR_SALE", message: "This claim is already in progress." });

  const [buyer, avail] = await Promise.all([StellarAccount.load(userId), availability(ctx, asset)]);
  if (!buyer) problems.push({ code: "ACCOUNT_INACTIVE", message: "Your wallet isn't active on Stellar yet. Add some XLM to activate it." });
  if (!avail.available) problems.push({ code: "SOLD_OUT", message: "No copies are left to claim." });

  const needsTrust = !buyer?.hasTrustline(asset.code, asset.issuer);
  if (needsTrust && buyer && !buyer.canAddSubentries(1)) {
    problems.push({ code: "TOO_MANY_ASSETS", message: "Your wallet holds the maximum number of different assets (1000). Remove one first." });
  }

  // payment to the platform + trustline (+ reserve top-up) + one delivery
  const ops = 1 + (needsTrust ? (method === "XLM" ? 1 : 2) : 0) + 1;
  const networkFeeXlm = (ops * Number(TrxBaseFee)) / 1e7;
  const feeSource: "buyer" | "mother" = method === "XLM" ? "buyer" : buyer && buyer.spendableXlm() >= networkFeeXlm ? "buyer" : "mother";

  const lines: CostLine[] = [];
  let currency = PLATFORM_ASSET.code;
  let balance: number | null = null;
  try {
    if (method === "PLATFORM_ASSET") {
      lines.push({ key: "platformFee", label: "Platform fee", amount: Number(PLATFORM_FEE), currency, inTotal: true });
      if (feeSource === "mother") {
        lines.push({ key: "networkFee", label: "Network fee", amount: Number(TrxBaseFeeInPlatformAsset), currency, inTotal: true });
      } else {
        lines.push({ key: "networkFee", label: "Network fee", amount: networkFeeXlm, currency: "XLM", hint: "Paid in XLM from your wallet", inTotal: false });
      }
      if (needsTrust) {
        lines.push({
          key: "reserve",
          label: "Wallet reserve for this item",
          amount: await xlmToPlatform(BASE_RESERVE_XLM),
          currency,
          hint: "Stellar locks 0.5 XLM per new item; covered once",
          inTotal: true,
        });
      }
      balance = buyer?.platformBalance() ?? 0;
      if (buyer && !buyer.trustsPlatformAsset()) {
        problems.push({ code: "NO_PLATFORM_TRUST", message: `Your wallet doesn't hold ${currency} yet. Get some ${currency} first.`, action: "recharge" });
      }
    } else {
      currency = "XLM";
      lines.push({ key: "platformFee", label: "Platform fee", amount: PLATFORM_FEE_XLM, currency, inTotal: true });
      lines.push({ key: "networkFee", label: "Network fee", amount: networkFeeXlm, currency, inTotal: true });
      if (needsTrust) {
        lines.push({ key: "reserve", label: "Wallet reserve for this item", amount: BASE_RESERVE_XLM, currency, hint: "Stays in your wallet; returned if you remove the item", inTotal: true });
      }
      balance = buyer?.spendableXlm() ?? 0;
    }
  } catch {
    problems.push({ code: "PRICE_UNAVAILABLE", message: "Couldn't load exchange rates. Try again in a moment." });
  }

  const total = round(sum(lines), currency === "XLM" ? 7 : 2);
  if (balance !== null && buyer && !problems.some((p) => p.code === "NO_PLATFORM_TRUST") && balance < total) {
    problems.push({
      code: method === "XLM" ? "INSUFFICIENT_XLM" : "INSUFFICIENT_FUNDS",
      message: `You need ${round(total - balance, currency === "XLM" ? 7 : 2)} more ${currency} (balance ${round(balance, 4)}, total ${total}).`,
      action: "recharge",
    });
  }
  if (method === "PLATFORM_ASSET" && feeSource === "buyer" && buyer && buyer.spendableXlm() < networkFeeXlm) {
    problems.push({ code: "INSUFFICIENT_XLM", message: "You need a little XLM for the network fee.", action: "recharge" });
  }
  // the platform fronts the reserve top-up and, when you have no XLM, the fee
  if ((needsTrust && method !== "XLM") || feeSource === "mother") {
    const mother = await StellarAccount.load(motherKeypair().publicKey());
    if (!mother || mother.spendableXlm() < BASE_RESERVE_XLM + 1) {
      problems.push({ code: "PLATFORM_UNAVAILABLE", message: "Claims are paused for a moment. Please try again shortly." });
    }
  }

  const quote: ClaimQuote = {
    method,
    item: { id: asset.id, name: asset.name, thumbnail: asset.thumbnail, creator: asset.creator?.name ?? null },
    currency,
    lines,
    total,
    balance,
    source: avail.stock > 0 ? "stock" : avail.mintable > 0 ? "mint" : null,
    needsTrustline: needsTrust,
    state,
    ok: problems.length === 0,
    problems,
  };
  return { loaded, quote, avail, buyer, feeSource, needsTrust, platformPay: total };
}

function emptyQuote(method: ClaimMethod, state: ClaimQuote["state"], problems: Problem[]): ClaimQuote {
  return { method, item: null, currency: PLATFORM_ASSET.code, lines: [], total: 0, balance: null, source: null, needsTrustline: false, state, ok: false, problems };
}

/** Preflight only: will the claim go through, and exactly what will it cost. */
export async function quoteClaim(ctx: Ctx, userId: string, consumerId: string, method: ClaimMethod) {
  return (await plan(ctx, userId, consumerId, method)).quote;
}

/* ──────────────────────────────────── build ──────────────────────────────────── */

async function stockKeypair(ctx: Ctx, asset: ClaimAsset) {
  if (!asset.creatorId) return platformStorageKeypair();
  const kp = await storageKeypairFor(ctx.db, asset.creatorId);
  if (!kp) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The brand's storage is unavailable." });
  return kp;
}

/** The transaction hash as hex (the SDK returns a Buffer or a plain Uint8Array depending on version). */
const hashHex = (tx: Transaction) => {
  const h = tx.hash() as unknown;
  return typeof h === "string" ? h : Buffer.from(h as Uint8Array).toString("hex");
};

const txExpiry = (tx: Transaction) => new Date((Number(tx.timeBounds?.maxTime ?? 0) || Math.floor(Date.now() / 1000) + TX_TIMEOUT_SECONDS) * 1000);

/**
 * Re-checks everything, then builds the transaction and records it as a PENDING
 * CLAIM (holding the copy until it expires), linked to the collect. The supply
 * check runs under a row lock on the asset, so two collectors can't both get
 * the last mintable copy.
 */
export async function prepareClaim(ctx: Ctx, { userId, consumerId, method, signWith }: { userId: string; consumerId: string; method: ClaimMethod; signWith: SignUserType }) {
  const result = await ctx.db.$transaction(
    async (tx) => {
      const inner = { ...ctx, db: tx as unknown as Db };
      const first = await load(inner, userId, consumerId);
      if (first.asset) await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${first.asset.id} FOR UPDATE`;

      const p = await plan(inner, userId, consumerId, method);
      const asset = p.loaded.asset;
      if (!p.quote.ok || !asset || !p.avail || !p.buyer) return { ok: false as const, quote: p.quote };

      const mother = motherKeypair();
      const motherPub = mother.publicKey();
      const token = toAsset(asset);
      const payCurrency = method === "XLM" ? Asset.native() : PLATFORM_ASSET;
      const source = p.feeSource === "buyer" ? p.buyer.raw : (await StellarAccount.loadOrThrow(motherPub, "Platform account")).raw;

      const built = new TransactionBuilder(source, { fee: TrxBaseFee, networkPassphrase }).setTimeout(TX_TIMEOUT_SECONDS);
      // 1. the fee bundle to the platform
      if (p.platformPay > 0) built.addOperation(Operation.payment({ source: userId, destination: motherPub, asset: payCurrency, amount: amt(p.platformPay) }));
      // 2. the trustline (the platform tops up the reserve unless the collector pays in XLM)
      if (p.needsTrust) {
        if (method !== "XLM") built.addOperation(Operation.payment({ source: motherPub, destination: userId, asset: Asset.native(), amount: amt(BASE_RESERVE_XLM) }));
        built.addOperation(Operation.changeTrust({ source: userId, asset: token }));
      }
      // 3. delivery: from the brand's stock, else minted straight to the collector
      const signers: Keypair[] = [];
      const fromStock = p.avail.stock > 0;
      if (fromStock) {
        const storage = await stockKeypair(inner, asset);
        built.addOperation(Operation.payment({ source: storage.publicKey(), destination: userId, asset: token, amount: "1.0000000" }));
        signers.push(storage);
      } else {
        if (!p.avail.issuer) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This item can't be minted right now." });
        built.addOperation(Operation.payment({ source: p.avail.issuer.publicKey(), destination: userId, asset: token, amount: "1.0000000" }));
        signers.push(p.avail.issuer);
      }
      const envelope = built.build();
      if (p.feeSource === "mother" || envelope.operations.some((op) => op.source === motherPub)) signers.push(mother);
      envelope.sign(...signers);

      const line = (k: CostLine["key"]) => p.quote.lines.filter((l) => l.key === k && l.currency === p.quote.currency).reduce((s, l) => s + l.amount, 0);
      const row = await tx.assetTransaction.create({
        data: {
          type: "CLAIM",
          assetId: asset.id,
          quantity: 1,
          minted: fromStock ? 0 : 1,
          buyerId: userId,
          creatorId: asset.creatorId,
          method,
          currency: p.quote.currency,
          platformFee: line("platformFee"),
          networkFee: line("networkFee"),
          reserveCost: line("reserve"),
          total: p.quote.total,
          txHash: hashHex(envelope),
          expiresAt: txExpiry(envelope),
          platformId: ctx.platform.id,
        },
      });
      // One claim per collect: the unique link refuses a second concurrent one.
      const linked = await tx.locationConsumer.updateMany({
        where: { id: consumerId, OR: [{ claimTxId: null }, { claimTxId: p.loaded.consumer.claimTxId }] },
        data: { claimTxId: row.id },
      });
      if (linked.count === 0) throw new TRPCError({ code: "CONFLICT", message: "This claim is already in progress." });

      return { ok: true as const, quote: p.quote, txId: row.id, xdr: await WithSing({ xdr: envelope.toXDR(), signWith }) };
    },
    { timeout: 30_000 },
  );
  return result;
}

/* ───────────────────────────────────── settle ───────────────────────────────────── */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Settles a PENDING claim from what Horizon says about its hash: success → the
 * copy is recorded as owned once; failure or expiry → the collect can be
 * claimed again. Polls briefly because Horizon can lag a few seconds.
 */
export async function settleClaim(db: Db, txId: string, { attempts = 6, wait = 1500 } = {}): Promise<AssetTransaction | null> {
  const row = await db.assetTransaction.findUnique({ where: { id: txId } });
  if (row?.type !== "CLAIM" || row.status !== "PENDING" || !row.txHash) return row;

  for (let i = 0; i < attempts; i++) {
    const ok = await transactionSucceeded(row.txHash);
    if (ok === true) return applySuccess(db, row);
    if (ok === false) return fail(db, row, "The transaction failed on the Stellar network.");
    if (i < attempts - 1) await delay(wait);
  }
  if (row.expiresAt && row.expiresAt < new Date()) return fail(db, row, "The transaction expired before it was submitted.");
  return row;
}

async function applySuccess(db: Db, row: AssetTransaction) {
  return db.$transaction(async (tx) => {
    // Only the first caller applies effects.
    const { count } = await tx.assetTransaction.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "SUCCESS", error: null } });
    if (count === 0) return tx.assetTransaction.findUniqueOrThrow({ where: { id: row.id } });
    if (row.assetId && row.minted > 0) await tx.asset.update({ where: { id: row.assetId }, data: { mintedCount: { increment: row.minted } } });
    if (row.assetId && row.buyerId) await tx.user_Asset.create({ data: { userId: row.buyerId, assetId: row.assetId } });
    return tx.assetTransaction.findUniqueOrThrow({ where: { id: row.id } });
  });
}

async function fail(db: Db, row: AssetTransaction, error: string) {
  // free the collect so it can be claimed again
  await db.locationConsumer.updateMany({ where: { claimTxId: row.id }, data: { claimTxId: null } });
  return db.assetTransaction.update({ where: { id: row.id }, data: { status: "FAILED", error } });
}
