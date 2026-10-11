"use client";

import { useParams, usePathname, useRouter as useNextRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

/**
 * The App Router's navigation hooks behind the small surface this app was
 * written against (the Pages Router's `useRouter`): `push` / `replace` /
 * `back` / `reload` / `pathname`, with a URL given either as a string or as
 * `{ pathname, query }`. Reading the URL's query is a separate hook
 * (`useQueryParams`) so only screens that need it opt into
 * `useSearchParams` (which has to sit under a Suspense boundary).
 */

type Query = Record<string, string | string[] | number | boolean | null | undefined>;
export type Url = string | { pathname?: string; query?: Query };

function toHref(url: Url, fallbackPath: string) {
  if (typeof url === "string") return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(url.query ?? {})) {
    if (v == null || v === "") continue;
    for (const item of Array.isArray(v) ? v : [v]) qs.append(k, String(item));
  }
  const s = qs.toString();
  return `${url.pathname ?? fallbackPath}${s ? `?${s}` : ""}`;
}

type NavOptions = { shallow?: boolean; scroll?: boolean };

export function useRouter() {
  const router = useNextRouter();
  const pathname = usePathname();
  return useMemo(
    () => ({
      pathname,
      push: (url: Url, _as?: unknown, opts?: NavOptions) => {
        router.push(toHref(url, pathname), { scroll: opts?.scroll ?? !opts?.shallow });
        return Promise.resolve(true);
      },
      replace: (url: Url, _as?: unknown, opts?: NavOptions) => {
        router.replace(toHref(url, pathname), { scroll: opts?.scroll ?? !opts?.shallow });
        return Promise.resolve(true);
      },
      back: () => router.back(),
      reload: () => window.location.reload(),
    }),
    [router, pathname],
  );
}

/**
 * Dynamic route params merged with the query string (`/events/[id]?tab=x` →
 * `{ id, tab }`), like the Pages Router's `router.query`. `ready` is always
 * true: App Router client components have both from the first render.
 */
export function useQueryParams() {
  const params = useParams<Record<string, string | string[]>>();
  const search = useSearchParams();
  return useMemo(() => {
    const query: Record<string, string | string[] | undefined> = { ...params };
    for (const key of new Set(search.keys())) {
      const all = search.getAll(key);
      query[key] = all.length > 1 ? all : all[0];
    }
    return { query, ready: true as const };
  }, [params, search]);
}
