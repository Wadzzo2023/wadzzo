"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@wadzzo/ui/poster/dropdown-menu";

import { CREATE_ACTIONS } from "./nav";

/** Desktop "Create": a round + in the sidebar header (beside the bell), every new-thing flow in one menu. */
export function CreateMenu({
  navPermission,
  collapsed = false,
}: {
  navPermission: boolean;
  collapsed?: boolean;
}) {
  const actions = CREATE_ACTIONS.filter((a) => !a.gated || navPermission);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Create"
          aria-label="Create"
          className="bg-side-ink text-side relative flex size-10 shrink-0 items-center justify-center rounded-full transition-transform duration-200 hover:scale-110 data-[state=open]:scale-110"
        >
          <Plus className="size-5" strokeWidth={2.8} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={collapsed ? "right" : "bottom"} className="w-72">
        <DropdownMenuLabel className="font-hud text-muted-foreground text-[11px] tracking-wider uppercase">
          Create
        </DropdownMenuLabel>
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <DropdownMenuItem key={a.href} asChild className="cursor-pointer gap-3 py-2">
              <Link href={a.href}>
                <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{a.label}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {a.description}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
