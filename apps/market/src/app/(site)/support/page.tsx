import { HelpCircle, Mail, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StaticHeader } from "~/components/static/static-header";
import { SupportForm } from "~/components/static/support-form";
import { PageBody } from "@wadzzo/ui/patterns/page-header";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with your Wadzzo account, wallet, purchases, memberships or bounties.",
  alternates: { canonical: "/support" },
};

const HELP = [
  {
    icon: HelpCircle,
    title: "FAQ",
    text: "Answers about paying, reserves, resale and memberships.",
    href: "/faq",
  },
  {
    icon: Wallet,
    title: "Activity",
    text: "Every transaction with a receipt and a Stellar link.",
    href: "/activity",
  },
];

export default function SupportPage() {
  return (
    <PageBody wide className="space-y-8">
      <StaticHeader
        eyebrow="Support"
        title={
          <>
            How can we <span className="text-gradient">help?</span>
          </>
        }
        description="Send us a message and we'll reply by email."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <SupportForm />
        <aside className="space-y-3">
          <a
            href="mailto:support@wadzzo.com"
            className="glass hover:glow flex items-center gap-3 rounded-2xl p-4 transition-all"
          >
            <span className="bg-primary/15 text-primary flex size-10 items-center justify-center rounded-xl">
              <Mail className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Email us directly</span>
              <span className="text-muted-foreground block text-sm">support@wadzzo.com</span>
            </span>
          </a>
          {HELP.map((h) => (
            <Link
              key={h.title}
              href={h.href}
              className="glass hover:glow flex items-center gap-3 rounded-2xl p-4 transition-all"
            >
              <span className="bg-primary/15 text-primary flex size-10 items-center justify-center rounded-xl">
                <h.icon className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{h.title}</span>
                <span className="text-muted-foreground block text-sm">{h.text}</span>
              </span>
            </Link>
          ))}
        </aside>
      </div>
    </PageBody>
  );
}
