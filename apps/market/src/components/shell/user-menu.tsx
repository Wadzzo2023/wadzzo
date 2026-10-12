"use client";

import { LogIn, LogOut, Settings, User } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@wadzzo/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wadzzo/ui/components/dropdown-menu";
import { useRequireAuth } from "~/hooks/use-require-auth";
import { api } from "~/utils/api";
import { abbreviateAddress } from "@wadzzo/utils/utils";

/** The avatar menu in the header: settings and sign in/out. Navigation lives in the sidebar. */
export function UserMenu() {
  const { signedIn, loading, session, openSignIn } = useRequireAuth();
  const me = api.user.me.useQuery(undefined, { enabled: signedIn });

  if (loading) return <div className="skeleton size-9 rounded-full" />;

  const id = session?.user.id;
  const name = me.data?.name ?? session?.user.name ?? "Your account";
  const image = me.data?.image ?? session?.user.image ?? undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="ring-offset-background hover:ring-primary/40 rounded-full transition-shadow hover:ring-2"
        aria-label="Menu"
      >
        <Avatar className="size-9">
          {signedIn && <AvatarImage src={image} alt="" />}
          <AvatarFallback className="bg-primary/10 text-primary">
            <User className="size-4" />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[80dvh] w-56 overflow-y-auto">
        {signedIn ? (
          <>
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-sm font-semibold">{name}</span>
              {id && (
                <span className="text-muted-foreground block truncate font-mono text-[11px]">
                  {abbreviateAddress(id, 6)}
                </span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2">
              <Link href="/settings">
                <Settings className="size-4" /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void signOut({ callbackUrl: "/" })}
              className="text-destructive focus:text-destructive gap-2"
            >
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            onSelect={openSignIn}
            className="text-primary focus:text-primary gap-2 font-semibold"
          >
            <LogIn className="size-4" /> Sign in / Sign up
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
