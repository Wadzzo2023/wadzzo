import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearPriceCache, platformToUsd, platformToXlm, xlmToPlatform, xlmUsd } from "../prices";

vi.mock("axios");
// eslint-disable-next-line @typescript-eslint/unbound-method -- a mock, called without `this`
const get = vi.mocked(axios.get);

beforeEach(() => {
  vi.resetAllMocks();
  clearPriceCache();
});

describe("xlmUsd", () => {
  it("uses Stellar Expert and caches the answer", async () => {
    get.mockResolvedValue({ data: { price: 0.12 } });
    expect(await xlmUsd()).toBe(0.12);
    expect(await xlmUsd()).toBe(0.12);
    expect(get).toHaveBeenCalledOnce();
  });

  it("falls back to Binance when Stellar Expert is down or sends junk", async () => {
    get.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ data: { price: "0.2" } });
    expect(await xlmUsd()).toBe(0.2);

    clearPriceCache();
    get
      .mockResolvedValueOnce({ data: { price: 0 } })
      .mockResolvedValueOnce({ data: { price: "0.3" } });
    expect(await xlmUsd()).toBe(0.3);
  });

  it("fails with an app error, never NaN, when no source works", async () => {
    get.mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("down too"));
    await expect(xlmUsd()).rejects.toMatchObject({ code: "EXTERNAL_SERVICE_FAILED" });

    clearPriceCache();
    get.mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: { price: "oops" } });
    await expect(xlmUsd()).rejects.toMatchObject({ code: "EXTERNAL_SERVICE_FAILED" });
  });
});

describe("conversions (testnet: platform token pegged at $0.01)", () => {
  it("rounds up so a payer never under-pays", async () => {
    get.mockResolvedValue({ data: { price: 0.1 } }); // 1 XLM = $0.10 = 10 tokens
    expect(await xlmToPlatform(1)).toBe(10);
    expect(await xlmToPlatform(0.123)).toBe(1.23);
    expect(await platformToXlm(10)).toBe(1);
    expect(await platformToUsd(150)).toBe(1.5);
  });

  it("is zero for nothing", async () => {
    expect(await xlmToPlatform(0)).toBe(0);
    expect(await platformToXlm(-1)).toBe(0);
    expect(await platformToUsd(0)).toBe(0);
    expect(get).not.toHaveBeenCalled();
  });
});
