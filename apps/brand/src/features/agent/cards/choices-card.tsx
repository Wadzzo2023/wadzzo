"use client";

import { Check, CornerDownLeft, MessageCircleQuestion } from "lucide-react";
import { useState } from "react";

import { Button } from "@wadzzo/ui/components/button";
import type { AgentBlock } from "@wadzzo/agent-contract";
import { cn } from "@wadzzo/ui/lib/cn";

type Choices = Extract<AgentBlock, { kind: "choices" }>;

/**
 * A question from the agent with tappable options. One tap answers a
 * single-choice question; with `multiple`, tick several then Continue. The
 * answer goes back as the person's next message.
 */
export function ChoicesCard({
  block,
  disabled,
  onAnswer,
}: {
  block: Choices;
  disabled: boolean;
  onAnswer: (labels: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const answered = block.answered;
  const locked = disabled || Boolean(answered);

  const choose = (label: string) => {
    if (locked) return;
    if (!block.multiple) return onAnswer([label]);
    setPicked((p) => (p.includes(label) ? p.filter((l) => l !== label) : [...p, label]));
  };
  const submitOther = () => {
    const text = other.trim();
    if (text && !locked) onAnswer(block.multiple ? [...picked, text] : [text]);
  };

  return (
    <section className="border-primary/30 from-primary/10 via-card to-card rounded-xl border bg-linear-to-br p-3">
      <p className="mb-2 flex items-start gap-2 text-sm font-medium">
        <MessageCircleQuestion className="text-primary mt-0.5 size-4 shrink-0" />
        {block.question}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {block.options.map((o) => {
          const on = answered ? answered.includes(o.label) : picked.includes(o.label);
          return (
            <button
              key={o.id}
              type="button"
              disabled={locked && !on}
              onClick={() => choose(o.label)}
              title={o.description}
              aria-pressed={on}
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:border-primary/60 hover:bg-primary/5",
                locked && !on && "opacity-50",
                locked && "cursor-default",
              )}
            >
              {on && <Check className="size-3 shrink-0" />}
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
      {block.options.some((o) => o.description) && !locked && (
        <ul className="text-muted-foreground mt-2 space-y-0.5 text-[11px]">
          {block.options
            .filter((o) => o.description)
            .map((o) => (
              <li key={o.id}>
                <b className="text-foreground font-medium">{o.label}</b> — {o.description}
              </li>
            ))}
        </ul>
      )}
      {!locked && (block.allowOther || block.multiple) && (
        <div className="mt-2 flex items-center gap-1.5">
          {block.allowOther && (
            <div className="relative min-w-0 flex-1">
              <input
                value={other}
                onChange={(e) => setOther(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submitOther())}
                placeholder="Something else…"
                className="bg-card focus:border-primary h-8 w-full rounded-md border pr-7 pl-2.5 text-xs outline-none"
                maxLength={200}
              />
              <CornerDownLeft className="text-faint pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2" />
            </div>
          )}
          {block.multiple && (
            <Button
              size="sm"
              disabled={picked.length === 0 && !other.trim()}
              onClick={() => (other.trim() ? submitOther() : onAnswer(picked))}
            >
              Continue{picked.length > 0 && ` (${picked.length})`}
            </Button>
          )}
        </div>
      )}
      {answered && answered.some((a) => !block.options.some((o) => o.label === a)) && (
        <p className="text-muted-foreground mt-2 text-xs">
          You said: {answered.filter((a) => !block.options.some((o) => o.label === a)).join(", ")}
        </p>
      )}
    </section>
  );
}
