import "server-only";

import { randomUUID } from "crypto";

import { SquareClient, SquareEnvironment, SquareError } from "square";

import { env } from "../../env";
import { AppError, ErrorCodes } from "@wadzzo/errors";

let client: SquareClient | undefined;

/** The Square client, made on first payment so importing this file needs no Square settings. */
function getSquareClient(): SquareClient {
  client ??= new SquareClient({
    token: env.SQUARE_ACCESS_TOKEN,
    environment:
      env.SQUARE_ENVIRONMENT.toLowerCase() === "production"
        ? SquareEnvironment.Production
        : SquareEnvironment.Sandbox,
  });
  return client;
}

function describe(e: unknown) {
  if (e instanceof SquareError && e.errors.length)
    return e.errors.map((x) => x.detail ?? x.code).join("; ");
  return e instanceof Error ? e.message : "unknown error";
}

/** Charges a card (Square Web Payments token). Returns the payment id, or throws with Square's reason. */
export async function chargeCard({
  sourceId,
  verificationToken,
  usd,
  note,
}: {
  sourceId: string;
  verificationToken?: string;
  usd: number;
  note: string;
}) {
  try {
    const res = await getSquareClient().payments.create({
      idempotencyKey: randomUUID(),
      sourceId,
      verificationToken,
      note,
      amountMoney: { currency: "USD", amount: BigInt(Math.round(usd * 100)) },
    });
    if (res.payment?.status !== "COMPLETED" || !res.payment.id) {
      throw new AppError(ErrorCodes.PAYMENT_FAILED, {
        message:
          res.errors?.map((x) => x.detail ?? x.code).join("; ") ?? "Payment was not completed",
      });
    }
    return res.payment.id;
  } catch (e) {
    throw new AppError(ErrorCodes.PAYMENT_FAILED, {
      message: `Card payment failed: ${describe(e)}`,
    });
  }
}

/** Refunds a whole card payment (used when the item can't be delivered). */
export async function refundCard(paymentId: string, usd: number, reason: string) {
  await getSquareClient().refunds.refundPayment({
    idempotencyKey: randomUUID(),
    paymentId,
    reason,
    amountMoney: { currency: "USD", amount: BigInt(Math.round(usd * 100)) },
  });
}
