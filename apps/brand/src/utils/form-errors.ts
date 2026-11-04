import toast from "react-hot-toast";
import type { FieldErrors, FieldValues } from "react-hook-form";

type Issue = { field: string; message: string };

/** "pinCollectionLimit" → "Pin collection limit". */
function fieldLabel(path: string[]) {
  const last = [...path].reverse().find((p) => Number.isNaN(Number(p))) ?? path.join(" ");
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function collect(errors: unknown, path: string[], out: Issue[]) {
  if (!errors || typeof errors !== "object") return;
  const e = errors as Record<string, unknown>;
  if (typeof e.message === "string" && e.message && "type" in e) {
    out.push({ field: fieldLabel(path), message: e.message });
    return;
  }
  for (const [key, value] of Object.entries(e)) {
    if (key === "ref" || key === "root") continue;
    collect(value, [...path, key], out);
  }
  if (e.root) collect(e.root, path, out);
}

/**
 * Pass as the second argument of react-hook-form's `handleSubmit` so a form
 * that fails validation says why in a toast, not only next to the field
 * (which may be scrolled out of view): the first problem, plus how many more.
 */
export function toastFormErrors<T extends FieldValues>(errors: FieldErrors<T>) {
  const issues: Issue[] = [];
  collect(errors, [], issues);
  const first = issues[0];
  if (!first) {
    toast.error("Please check the form and try again.");
    return;
  }
  const more = issues.length - 1;
  toast.error(
    `${first.field}: ${first.message}${more > 0 ? ` (+${more} more ${more === 1 ? "issue" : "issues"})` : ""}`,
  );
}
