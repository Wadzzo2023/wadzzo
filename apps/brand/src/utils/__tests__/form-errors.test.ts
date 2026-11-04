import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const error = vi.fn();
vi.mock("react-hot-toast", () => ({ default: { error: (m: string) => void error(m) } }));

import { toastFormErrors } from "../form-errors";

/** What react-hook-form's zodResolver hands to the invalid handler. */
const errorsOf = (schema: z.ZodType, input: unknown) => {
  const issues = schema.safeParse(input).error?.issues ?? [];
  return Object.fromEntries(
    issues.map((i) => [String(i.path[0]), { type: i.code, message: i.message }]),
  );
};

describe("toastFormErrors", () => {
  beforeEach(() => error.mockClear());

  it("names the field and the problem", () => {
    const schema = z.object({ title: z.string().min(3, "Title must be at least 3 characters") });
    toastFormErrors(errorsOf(schema, { title: "ab" }));
    expect(error).toHaveBeenCalledWith("Title: Title must be at least 3 characters");
  });

  it("counts the other problems", () => {
    const schema = z.object({
      title: z.string().min(3, "Too short"),
      pinCollectionLimit: z.number().min(1, "Must be at least 1"),
      radius: z.number().min(1, "Must be at least 1"),
    });
    toastFormErrors(errorsOf(schema, { title: "a", pinCollectionLimit: 0, radius: 0 }));
    expect(error).toHaveBeenCalledWith("Title: Too short (+2 more issues)");
  });

  it("labels camelCase fields and reaches nested ones", () => {
    toastFormErrors({
      pinCollectionLimit: { type: "min", message: "Must be at least 1" },
    });
    expect(error).toHaveBeenCalledWith("Pin collection limit: Must be at least 1");
    error.mockClear();
    toastFormErrors({ tiers: [{ price: { type: "min", message: "Required" } }] } as never);
    expect(error).toHaveBeenCalledWith("Price: Required");
  });

  it("falls back to a generic message", () => {
    toastFormErrors({});
    expect(error).toHaveBeenCalledWith("Please check the form and try again.");
  });
});
