/** Marker value for "no value chosen" in selects that can't hold an empty string. */
export const BLANK_KEYWORD = "BLANK";

/**
 * A trimmed string, or `undefined` when it's missing *or* blank.
 *
 * Lets fallback chains use `??`: an empty display name or bio is not nullish,
 * so `??` alone would keep `""` and render a blank where a fallback was meant.
 */
export function nonBlank(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}
