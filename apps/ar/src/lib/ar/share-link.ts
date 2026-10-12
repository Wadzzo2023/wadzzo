/**
 * Native share sheet where there is one, clipboard where there isn't.
 * Returns what happened so the page can say "Link copied".
 */
export async function shareLink(title: string, url: string) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return "shared" as const;
    } catch {
      return "cancelled" as const;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied" as const;
  } catch {
    return "cancelled" as const;
  }
}
