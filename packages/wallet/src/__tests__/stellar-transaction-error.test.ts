import { describe, expect, it } from "vitest";

import {
  StellarTransactionError,
  describeStellarError,
  isRecoverableStellarError,
  summarizeStellarError,
} from "../errors/stellar-transaction-error";

/** The shape the Stellar SDK's Horizon errors have. */
const horizonFailure = (
  resultCodes: { transaction?: string; operations?: string[] },
  extra: { detail?: string; title?: string } = {},
) => ({
  response: { data: { ...extra, extras: { result_codes: resultCodes } } },
});

describe("summarizeStellarError", () => {
  it("explains a transaction-level result code", () => {
    const summary = summarizeStellarError(horizonFailure({ transaction: "tx_bad_seq" }));
    expect(summary.resultCode).toBe("tx_bad_seq");
    expect(summary.message).toMatch(/sequence number/);
    expect(summary.isRecoverable).toBe(true);
  });

  it("explains the failing operation when the transaction only says tx_failed", () => {
    const summary = summarizeStellarError(
      horizonFailure({
        transaction: "tx_failed",
        operations: ["op_success", "payment_underfunded"],
      }),
    );
    expect(summary.resultCode).toBe("payment_underfunded");
    expect(summary.message).toBe("Insufficient balance to complete payment");
    expect(summary.details).toBe("Operation 2 of 2 failed");
  });

  it("describes network problems, timeouts and bad XDR", () => {
    expect(summarizeStellarError({ request: {} }).resultCode).toBe("network_error");
    expect(summarizeStellarError({ code: "ECONNABORTED" }).resultCode).toBe("timeout_error");
    expect(summarizeStellarError(new Error("Invalid XDR content")).resultCode).toBe(
      "xdr_parse_error",
    );
    expect(summarizeStellarError(undefined).resultCode).toBe("unknown_error");
  });

  it("never throws, whatever it is given", () => {
    for (const value of [null, 42, "oops", {}, [], { response: {} }]) {
      expect(() => summarizeStellarError(value)).not.toThrow();
    }
  });

  it("builds readable text", () => {
    expect(describeStellarError(horizonFailure({ operations: ["payment_no_trust"] }))).toContain(
      "no trustline",
    );
    expect(isRecoverableStellarError({ request: {} })).toBe(true);
    expect(isRecoverableStellarError(horizonFailure({ operations: ["payment_malformed"] }))).toBe(
      false,
    );
  });
});

describe("StellarTransactionError", () => {
  it("is an app error with a code matching what went wrong", () => {
    const cases: [object, string][] = [
      [horizonFailure({ operations: ["payment_underfunded"] }), "STELLAR_INSUFFICIENT_BALANCE"],
      [horizonFailure({ operations: ["payment_no_trust"] }), "STELLAR_TRUSTLINE_MISSING"],
      [horizonFailure({ transaction: "tx_no_source_account" }), "STELLAR_ACCOUNT_NOT_FOUND"],
      [{ request: {} }, "STELLAR_NETWORK_UNAVAILABLE"],
      [horizonFailure({ transaction: "tx_bad_auth" }), "STELLAR_TX_REJECTED"],
    ];
    for (const [failure, code] of cases) {
      const error = new StellarTransactionError(failure);
      expect(error.code).toBe(code);
      expect(error.name).toBe("StellarTransactionError");
    }
  });

  it("keeps the Stellar reason and the original cause", () => {
    const failure = horizonFailure({ transaction: "tx_bad_seq" }, { detail: "stale" });
    const error = new StellarTransactionError(failure);
    expect(error.resultCode).toBe("tx_bad_seq");
    expect(error.isRecoverable).toBe(true);
    expect(error.cause).toBe(failure);
    expect(error.getUserMessage()).toContain("stale");
  });
});
