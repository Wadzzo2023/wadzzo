import { describe, expect, it } from "vitest";

import { formatAmount } from "../quote";

describe("formatAmount", () => {
  it("shows XLM to the stroop, tokens to the cent, USD with a dollar sign", () => {
    expect(formatAmount(1.23456789, "XLM")).toBe("1.2345679 XLM");
    expect(formatAmount(1.239, "WADZZO")).toBe("1.24 WADZZO");
    expect(formatAmount(5, "USD")).toBe("$5.00");
    expect(formatAmount(1234.5, "USD")).toBe("$1,234.50");
  });
});
