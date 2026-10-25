"use client";

import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "~/ui/skin/fields";
import { cn } from "@wadzzo/ui/lib/cn";

export { Toolbar } from "@wadzzo/ui/patterns/toolbar";

/** Search box with a clear button. `onSearch` fires after typing pauses. */
export function SearchInput({
  value,
  onSearch,
  placeholder = "Search",
  delay = 300,
  className,
}: {
  value?: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  delay?: number;
  className?: string;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => {
    const t = setTimeout(() => onSearch(text.trim()), delay);
    return () => clearTimeout(t);
  }, [text, delay, onSearch]);

  return (
    <div className={cn("relative min-w-0 flex-1 sm:w-72 sm:flex-none", className)}>
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
        strokeWidth={2.6}
      />
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setText("")}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pr-9 pl-10 [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          onClick={() => setText("")}
          aria-label="Clear search"
          className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
