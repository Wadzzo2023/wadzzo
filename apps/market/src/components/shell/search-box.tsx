"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Input } from "@wadzzo/ui/components/input";
import { cn } from "@wadzzo/ui/lib/cn";

/** Global search: Enter opens /search?q=… */
export function SearchBox({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params?.get("q") ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim().length >= 2) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <form role="search" onSubmit={submit} className={cn("relative", className)}>
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search items, creators, posts"
        aria-label="Search"
        autoFocus={autoFocus}
        className="h-10 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
    </form>
  );
}
