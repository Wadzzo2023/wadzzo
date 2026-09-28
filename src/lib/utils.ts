import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export const BLANK_KEYWORD = "BLANK";

/**
 * A trimmed string, or `undefined` when it's missing *or* blank.
 *
 * Exists so fallback chains can use `??`. Plain `||` also works, but `??`
 * alone would not: an empty display name, bio, or joined-but-empty list is
 * not nullish, so `??` would keep `""` and render a blank where a fallback
 * was intended. Collapsing blank to `undefined` here makes "absent" and
 * "empty" mean the same thing, which is what those chains actually intend —
 * and satisfies `prefer-nullish-coalescing` honestly rather than by
 * suppressing it.
 */
export function nonBlank(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}
