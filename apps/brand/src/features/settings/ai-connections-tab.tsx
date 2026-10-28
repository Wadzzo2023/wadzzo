"use client";

import { formatDistanceToNow } from "date-fns";
import { Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@wadzzo/ui/poster/button";
import { Input } from "@wadzzo/ui/poster/input";
import { Field } from "~/ui/form-page";
import { api } from "~/utils/api";

const copyText = (value: string, what: string) =>
  void navigator.clipboard.writeText(value).then(
    () => toast.success(`${what} copied`),
    () => toast.error(`Couldn't copy the ${what.toLowerCase()}`),
  );

/**
 * AI connections: tokens that let an AI app (Claude, Cursor, …) use the map
 * agent as this person through the portal's MCP server at /api/mcp.
 */
export function AiConnectionsTab() {
  const utils = api.useUtils();
  const tokens = api.mcpTokens.list.useQuery();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);

  const create = api.mcpTokens.create.useMutation({
    onSuccess: (row) => {
      setCreated({ name: row.name, token: row.token });
      setName("");
      void utils.mcpTokens.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const revoke = api.mcpTokens.revoke.useMutation({
    onSuccess: () => {
      toast.success("Token revoked");
      void utils.mcpTokens.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const endpoint = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;
  const shownToken = created?.token ?? "YOUR_TOKEN";

  return (
    <div className="bg-card border-foreground/10 space-y-6 rounded-[1.4rem] border-2 p-4 sm:p-5">
      <p className="text-muted-foreground text-sm">
        Use the map agent from an AI app such as Claude or Cursor. It can do everything the chat on
        the Pins map does, as you: find places and events, report on your pins, and prepare changes.
        Changes still need a confirmation before anything happens.
      </p>

      <Field label="Server URL" action={<CopyButton value={endpoint} what="URL" />}>
        <code className="bg-muted block rounded-md px-3 py-2 text-sm break-all">{endpoint}</code>
      </Field>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate({ name: name.trim() });
        }}
      >
        <div className="min-w-0 flex-1">
          <Field
            label="New token"
            htmlFor="mcp-token-name"
            hint="Name it after the app you'll use it in."
          >
            <Input
              id="mcp-token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Claude Desktop"
              maxLength={60}
            />
          </Field>
        </div>
        <Button type="submit" disabled={!name.trim() || create.isPending} className="mb-6">
          {create.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />} Create
        </Button>
      </form>

      {created && (
        <div className="border-primary/40 bg-primary/5 space-y-2 rounded-lg border p-3">
          <p className="text-sm font-semibold">
            Token “{created.name}” created. Copy it now: it won&rsquo;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-background min-w-0 flex-1 rounded-md px-3 py-2 text-xs break-all">
              {created.token}
            </code>
            <CopyButton value={created.token} what="Token" />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Connect an app</h3>
        <Snippet
          title="Claude Code"
          code={`claude mcp add --transport http wadzzo-brand ${endpoint} --header "Authorization: Bearer ${shownToken}"`}
        />
        <Snippet
          title="Cursor, Claude Desktop and other apps (MCP config JSON)"
          code={JSON.stringify(
            {
              mcpServers: {
                "wadzzo-brand": {
                  url: endpoint,
                  headers: { Authorization: `Bearer ${shownToken}` },
                },
              },
            },
            null,
            2,
          )}
        />
        <p className="text-muted-foreground text-xs">
          If an app can&rsquo;t send headers, run it through{" "}
          <code>{`npx mcp-remote ${endpoint} --header "Authorization: Bearer ${shownToken}"`}</code>
          .
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Your tokens</h3>
        {tokens.isPending ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : !tokens.data?.length ? (
          <p className="text-muted-foreground text-sm">No tokens yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {tokens.data.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="text-muted-foreground text-xs">
                    <code>{t.prefix}…</code> · created{" "}
                    {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })} ·{" "}
                    {t.lastUsedAt
                      ? `used ${formatDistanceToNow(new Date(t.lastUsedAt), { addSuffix: true })}`
                      : "never used"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ id: t.id })}
                >
                  <Trash2 /> Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium">{title}</p>
        <CopyButton value={code} what="Snippet" />
      </div>
      <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">{code}</pre>
    </div>
  );
}

function CopyButton({ value, what }: { value: string; what: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        copyText(value, what);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check /> : <Copy />} Copy
    </Button>
  );
}
