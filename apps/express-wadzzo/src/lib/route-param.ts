/**
 * Express 5 types a route parameter as `string | string[]`. Ours are always a
 * single path segment, so take the first value (empty string when absent).
 */
export function routeParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}
