/**
 * Keeps the start and end of a long string and replaces the middle with
 * "...": `GABC...WXYZ`. Short strings come back unchanged.
 */
export function truncateMiddle(text: string, startLength = 3, endLength = 3): string {
  if (text.length <= startLength + endLength) return text;
  return `${text.slice(0, startLength)}...${text.slice(-endLength)}`;
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
