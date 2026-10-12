"use client";

import {
  ChevronRight,
  Coins,
  Footprints,
  LogOut,
  Moon,
  MonitorSmartphone,
  Sun,
  Vibrate,
  Volume2,
  Wallet,
  Zap,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "~/lib/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { HoloCard } from "~/components/cards/HoloCard";
import { MuralPackSettings } from "~/components/murals/MuralPackSettings";
import { Skeleton } from "~/components/ui/Skeleton";
import { AppShell, BackButton, ScreenHeader } from "~/components/shell/AppShell";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { StatBlock } from "~/components/ui/Badges";
import { formatDistance } from "@wadzzo/ar-core/ar/geo";
import { CHIME_NOTE_MS, useFeedback, type FeedbackReport } from "~/lib/ar/feedback";
import { RARITY_META, RARITY_ORDER } from "@wadzzo/ar-core/ar/rarity";
import { useAuth, useSettings } from "~/lib/ar/store";
import { api } from "~/utils/api";
import { type ThemePreference, useTheme } from "~/lib/ar/theme";
import type { ArSettings } from "@wadzzo/ar-core/ar/types";
import { useDragScroll } from "~/lib/ar/useDragScroll";
import { useBrands, usePinsQuery } from "~/lib/ar/usePins";
import { cn } from "@wadzzo/ui/lib/cn";
import { platformBranding } from "@wadzzo/platform/branding";

const THEME_OPTIONS: {
  value: ThemePreference;
  icon: typeof Sun;
  label: string;
}[] = [
  { value: "auto", icon: MonitorSmartphone, label: "System" },
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
];

/**
 * Hides the "Test feedback" row without removing it — flip back to `true`
 * to bring it back. Built for verifying Haptics/Sound actually fire (both
 * fail silently otherwise, and iOS has no Vibration API at all), not
 * something a viewer needs to see on every visit to Settings.
 */
const SHOW_FEEDBACK_TEST = false;

const TOGGLES: {
  key: keyof ArSettings;
  icon: typeof Zap;
  title: string;
  body: string;
}[] = [
  {
    key: "autoCollect",
    icon: Zap,
    title: "Auto-collect",
    body: "Claim eligible drops as you walk past them, without opening AR.",
  },
  {
    key: "followingOnly",
    icon: Users,
    title: "Following only",
    body: "Hide drops from brands you don't follow. Quieter map, fewer pins.",
  },
  {
    key: "haptics",
    icon: Vibrate,
    title: "Haptics",
    body: "A short buzz on capture and when a pin comes into range.",
  },
  {
    key: "sound",
    icon: Volume2,
    title: "Sound",
    body: "Capture chimes and rarity stings.",
  },
];

/**
 * ── /profile ───────────────────────────────────────────────────────────────
 *
 * Signed out, this is a pitch rather than a wall: it shows exactly what an
 * account gets you, in the app's own vocabulary, with the sign-in as the only
 * thing to press.
 *
 * Signed in, it's identity, totals, a rarity breakdown of the binder, and the
 * settings — with auto-collect first, because it's the only setting that
 * changes what the app does while your phone is in your pocket.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const requireAuth = useAuth((s) => s.requireAuth);
  const settings = useSettings();
  const theme = useTheme();

  const recentRailRef = useDragScroll<HTMLDivElement>();

  const { pins, isLoading: pinsLoading } = usePinsQuery();
  const brands = useBrands();
  const platformBalance = api.user.platformBalance.useQuery(undefined, {
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const coins = api.coins.balance.useQuery(undefined, {
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const collected = useMemo(() => (user ? pins.filter((p) => p.collected) : []), [pins, user]);

  const byRarity = useMemo(() => {
    const m = new Map<string, number>();
    collected.forEach((p) => {
      const r = p.rarity;
      m.set(r, (m.get(r) ?? 0) + 1);
    });
    return m;
  }, [collected]);

  const following = brands.filter((b) => b.followed).length;

  if (!user) return <SignedOut onSignIn={() => requireAuth("profile")} />;

  return (
    <AppShell tabs={false}>
      <div className="ar-scroll h-full">
        <ScreenHeader
          back
          eyebrow="Your account"
          title="Profile"
          trailing={
            <div className="flex flex-col items-end text-right">
              <span className="font-hud text-ar-faint mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase">
                <Coins size={11} strokeWidth={2.4} className="text-ar-green-hot" />
                <span>
                  {platformBalance.data
                    ? `${platformBalance.data.assetCode} balance`
                    : `${platformBranding.coinOwner} balance`}
                </span>
              </span>
              {platformBalance.isLoading ? (
                <Skeleton className="h-[22px] w-20" rounded="rounded-[4px]" />
              ) : platformBalance.isError || !platformBalance.data ? (
                <span className="font-hud text-ar-faint text-[12px] font-bold">
                  Couldn&rsquo;t load
                </span>
              ) : (
                <span
                  title={
                    !platformBalance.data.hasTrustline
                      ? "No trustline to this asset yet"
                      : undefined
                  }
                  className="font-hud text-glow-soft text-ar-green-hot text-[22px] leading-none font-bold tabular-nums"
                >
                  {platformBalance.data.balance.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </span>
              )}
            </div>
          }
        />

        {/* ── Identity ─────────────────────────────────────────────── */}
        <div className="rounded-ar-lg relative mx-5 overflow-hidden">
          <div className="ar-grid from-ar-green/20 via-ar-surface to-ar-surface absolute inset-0 bg-linear-to-br" />
          <div className="relative flex items-center gap-3.5 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user.avatarUrl}
              alt=""
              className="ring-ar-green/40 h-[62px] w-[62px] rounded-[18px] object-cover ring-2"
            />
            <div className="min-w-0 flex-1">
              <p className="text-ar-text truncate text-[17px] leading-tight font-semibold">
                {user.name}
              </p>
              <p className="font-hud text-ar-faint mt-0.5 text-[11px] tracking-[0.14em] uppercase">
                @{user.handle}
              </p>
              <p className="font-hud border-ar-line bg-ar-void/50 text-ar-dim mt-1.5 flex w-fit items-center gap-1.5 rounded-full border px-2 py-[2px] text-[9.5px] font-semibold tracking-[0.1em]">
                <Wallet size={9} strokeWidth={2.8} />
                {user.pubkey}
              </p>
            </div>
          </div>
        </div>

        {/* ── Wadzzo Coins (off-chain, from murals) ───────────────────
            Its own gold row, apart from the on-chain balance above, so the
            two never read as the same number. */}
        <Link
          href="/coins"
          className="rounded-ar border-gold/35 bg-gold/10 hover:bg-gold/15 mx-5 mt-3 flex items-center gap-3 border px-4 py-2.5 transition-colors"
        >
          <Coins size={16} strokeWidth={2.4} className="text-gold" />
          <span className="font-hud text-ar-dim flex-1 text-[11px] font-semibold tracking-[0.14em] uppercase">
            {platformBranding.coinName}
          </span>
          <span className="font-hud text-gold text-[16px] font-bold tabular-nums">
            {(coins.data?.balance ?? 0).toLocaleString()}
          </span>
          <ChevronRight size={15} strokeWidth={2.4} className="text-ar-faint" />
        </Link>

        {/* ── Totals ───────────────────────────────────────────────── */}
        <div className="rounded-ar border-ar-line mx-5 mt-3 flex items-center justify-around border bg-white/[0.03] py-3">
          <StatBlock label="Collectibles" value={collected.length} accent />
          <span className="bg-ar-line h-8 w-px" />
          <StatBlock label="Following" value={following} />
          <span className="bg-ar-line h-8 w-px" />
          <StatBlock label="Travelled" value={formatDistance(user.distanceTravelled)} />
        </div>

        {/* ── Rarity breakdown ─────────────────────────────────────── */}
        <section className="mt-5 px-5">
          <h2 className="font-hud text-ar-faint mb-2.5 text-[9.5px] font-semibold tracking-[0.24em] uppercase">
            Collection breakdown
          </h2>
          <div className="ar-bevel rounded-ar space-y-2.5 p-3.5">
            {RARITY_ORDER.map((r) => {
              const n = byRarity.get(r) ?? 0;
              const pct = collected.length ? (n / collected.length) * 100 : 0;
              const meta = RARITY_META[r];
              return (
                <div key={r} className="flex items-center gap-2.5">
                  <span
                    className="font-hud w-[68px] shrink-0 text-[9.5px] font-bold tracking-[0.12em] uppercase"
                    style={{ color: `hsl(${meta.hsl})` }}
                  >
                    {meta.label}
                  </span>
                  <div className="bg-ar-surface-3 h-[5px] flex-1 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${pct}%`,
                        background: `hsl(${meta.hsl})`,
                        boxShadow: `0 0 10px hsl(${meta.hsl}/0.85)`,
                      }}
                    />
                  </div>
                  <span className="font-hud text-ar-dim w-5 shrink-0 text-right text-[11px] font-bold tabular-nums">
                    {pinsLoading ? "" : n}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Recent ───────────────────────────────────────────────── */}
        {pinsLoading && (
          <section className="mt-5" role="status" aria-label="Loading recent finds">
            <div className="flex items-baseline justify-between px-5">
              <h2 className="font-hud text-ar-faint text-[9.5px] font-semibold tracking-[0.24em] uppercase">
                Latest finds
              </h2>
            </div>
            <div className="ar-scroll-x mt-2 flex gap-3.5 px-5 pb-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card-rail-item">
                  {/* 5/7 matches the card's own aspect, so the real card
                      doesn't resize the rail when it replaces this. */}
                  <Skeleton className="aspect-[5/7] w-full" rounded="rounded-ar-lg" />
                </div>
              ))}
            </div>
          </section>
        )}

        {!pinsLoading && collected.length > 0 && (
          <section className="mt-5">
            <div className="flex items-baseline justify-between px-5">
              <h2 className="font-hud text-ar-faint text-[9.5px] font-semibold tracking-[0.24em] uppercase">
                Latest finds
              </h2>
              <ArLinkButton href="/collection" variant="ghost" size="sm">
                See all
              </ArLinkButton>
            </div>
            <div ref={recentRailRef} className="ar-scroll-x mt-2 flex gap-3.5 px-5 pb-2">
              {collected.slice(0, 6).map((pin) => (
                <div key={pin.id} className="card-rail-item">
                  <HoloCard pin={pin} onClick={() => void router.push(`/collection/${pin.id}`)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Appearance ───────────────────────────────────────────── */}
        <section className="mt-5 px-5">
          <h2 className="font-hud text-ar-faint mb-2.5 text-[9.5px] font-semibold tracking-[0.24em] uppercase">
            Appearance
          </h2>
          <div className="ar-bevel rounded-ar flex items-start gap-3 p-3.5">
            <span
              className={cn(
                "mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border",
                "border-ar-green/50 bg-ar-green/14 text-ar-green-hot",
              )}
            >
              {theme.resolved === "light" ? (
                <Sun size={15} strokeWidth={2.2} />
              ) : (
                <Moon size={15} strokeWidth={2.2} />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <span className="font-hud text-ar-text block text-[12.5px] font-bold tracking-[0.1em] uppercase">
                Theme
              </span>
              <span className="text-ar-faint mt-1 block text-[11.5px] leading-relaxed">
                {theme.preference === "auto"
                  ? `Follows your device — currently ${theme.resolved}.`
                  : "Set manually, independent of your device."}
              </span>

              {/* A 3-way choice, not a boolean — the `Switch` used below
                  doesn't fit it, so this is its own small segmented control
                  rather than three separate on/off rows. */}
              <div
                role="radiogroup"
                aria-label="Theme"
                className="ar-key mt-3 grid grid-cols-3 gap-1 rounded-[12px] p-1"
              >
                {THEME_OPTIONS.map(({ value, icon: Icon, label }) => {
                  const active = theme.preference === value;
                  return (
                    <button
                      key={value}
                      role="radio"
                      aria-checked={active}
                      onClick={() => theme.setPreference(value)}
                      className={cn(
                        "font-hud flex items-center justify-center gap-1.5 rounded-[9px] py-2 text-[10px] font-bold tracking-[0.08em] uppercase transition-colors",
                        active ? "bg-ar-green/18 text-ar-green-hot" : "text-ar-faint",
                      )}
                    >
                      <Icon size={13} strokeWidth={2.4} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ── Settings ─────────────────────────────────────────────── */}
        <section className="mt-5 px-5">
          <h2 className="font-hud text-ar-faint mb-2.5 text-[9.5px] font-semibold tracking-[0.24em] uppercase">
            Settings
          </h2>
          <div className="ar-bevel divide-ar-line rounded-ar divide-y">
            {TOGGLES.map(({ key, icon: Icon, title, body }) => {
              const on = Boolean(settings[key]);
              return (
                <button
                  key={key}
                  onClick={() => settings.toggle(key)}
                  aria-pressed={on}
                  className="flex w-full items-start gap-3 p-3.5 text-left"
                >
                  <span
                    className={cn(
                      "mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border transition-colors",
                      on
                        ? "border-ar-green/50 bg-ar-green/14 text-ar-green-hot"
                        : "border-ar-line text-ar-faint bg-white/[0.04]",
                    )}
                  >
                    <Icon size={15} strokeWidth={2.2} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="font-hud text-ar-text block text-[12.5px] font-bold tracking-[0.1em] uppercase">
                      {title}
                    </span>
                    <span className="text-ar-faint mt-1 block text-[11.5px] leading-relaxed">
                      {body}
                    </span>
                  </span>

                  <Switch on={on} />
                </button>
              );
            })}

            {SHOW_FEEDBACK_TEST && <FeedbackTest />}
          </div>
        </section>

        {/* ── Mural pack ───────────────────────────────────────────── */}
        <section className="mx-5 mt-4">
          <p className="font-hud text-ar-faint mb-2 text-[10px] font-semibold tracking-[0.28em] uppercase">
            Downloads
          </p>
          <MuralPackSettings />
        </section>

        <div className="px-5 pt-4 pb-8">
          <ArButton variant="ghost" size="md" block icon={LogOut} onClick={signOut}>
            Sign out
          </ArButton>
        </div>
      </div>
    </AppShell>
  );
}

/**
 * ── FeedbackTest ───────────────────────────────────────────────────────────
 *
 * A row in the settings card that actually fires Haptics and Sound once, on
 * demand, instead of asking someone to go find a pin to capture.
 *
 * Exists because both channels fail *invisibly*. A muted phone, a suspended
 * `AudioContext`, and a genuinely broken setting all produce the same
 * symptom — silence — and iOS Safari has no Vibration API at all, so Haptics
 * does nothing there by design, not by bug. "Press test and see" isn't
 * enough on its own to tell those apart, which is why `feedback.test()`
 * returns a real `FeedbackReport` and this renders it rather than just
 * trusting that something happened.
 *
 * The bar visualiser is timed off `CHIME_NOTE_MS`, the same constant the
 * chime itself is built from, so the lights are a real readout of what's
 * playing rather than a decorative loop that happens to look close.
 */
function FeedbackTest() {
  const feedback = useFeedback();
  const [report, setReport] = useState<FeedbackReport | null>(null);
  const [activeNote, setActiveNote] = useState(-1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const run = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setActiveNote(-1);

    // Epic's four-note chime exercises the visualiser fully without being the
    // longest (mythic) or shortest (common) case.
    const result = feedback.test("epic");
    setReport(result);

    for (let i = 0; i < result.notes; i++) {
      timers.current.push(setTimeout(() => setActiveNote(i), i * CHIME_NOTE_MS));
    }
    timers.current.push(setTimeout(() => setActiveNote(-1), result.notes * CHIME_NOTE_MS + 280));
  };

  return (
    <div className="p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="font-hud text-ar-text block text-[12.5px] font-bold tracking-[0.1em] uppercase">
            Test feedback
          </span>
          <span className="text-ar-faint mt-1 block text-[11.5px] leading-relaxed">
            Hear the capture chime and feel the buzz, right now.
          </span>
        </div>

        <button onClick={run} className="ar-key shrink-0 rounded-full px-4 py-2">
          <span className="font-hud text-ar-text text-[10.5px] font-bold tracking-[0.12em] uppercase">
            Test
          </span>
        </button>
      </div>

      {/* Bar visualiser — lights in step with the chime's own notes. */}
      <div className="mt-3 flex h-6 items-end gap-1.5" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <motion.span
            key={i}
            animate={{
              height: activeNote === i ? "100%" : "35%",
              opacity: activeNote === i ? 1 : 0.35,
            }}
            transition={{ duration: 0.09 }}
            className="bg-ar-green-hot w-2 rounded-full"
            style={{
              boxShadow: activeNote === i ? "0 0 10px hsl(var(--ar-green)/0.9)" : undefined,
            }}
          />
        ))}
      </div>

      {report && <FeedbackReadout report={report} />}
    </div>
  );
}

/** What the last test actually did — reads honestly, not just "done". */
function FeedbackReadout({ report }: { report: FeedbackReport }) {
  const soundLine = !report.soundEnabled
    ? "Sound is off"
    : report.audio === "unsupported"
      ? "No audio support in this browser"
      : report.audio === "suspended"
        ? "Blocked — tap Test again"
        : "Sound played";

  const soundOk = report.soundEnabled && report.audio === "running";

  const hapticsLine = !report.hapticsEnabled
    ? "Haptics is off"
    : !report.hapticsSupported
      ? "Not supported on this device"
      : "Buzzed";

  const hapticsOk = report.hapticsEnabled && report.hapticsSupported;

  return (
    <dl className="border-ar-line mt-3 space-y-1.5 border-t pt-3">
      <ReadoutRow label="Sound" ok={soundOk} value={soundLine} />
      <ReadoutRow label="Haptics" ok={hapticsOk} value={hapticsLine} />
    </dl>
  );
}

function ReadoutRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <dt className="font-hud text-ar-faint font-semibold tracking-[0.1em] uppercase">{label}</dt>
      <dd className={cn("font-medium", ok ? "text-ar-green-hot" : "text-ar-dim")}>{value}</dd>
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-[3px] flex h-[24px] w-[42px] shrink-0 items-center rounded-full border p-[2px] transition-colors",
        on ? "border-ar-green/60 bg-ar-green/25" : "border-ar-line bg-ar-surface-3",
      )}
    >
      <span
        className={cn(
          "h-[18px] w-[18px] rounded-full transition-transform duration-200",
          on
            ? "bg-ar-green-hot translate-x-[18px] shadow-[0_0_10px_hsl(var(--ar-green)/0.9)]"
            : "bg-ar-faint translate-x-0",
        )}
      />
    </span>
  );
}

function SignedOut({ onSignIn }: { onSignIn: () => void }) {
  const perks = [
    { icon: Footprints, text: "Capture pins and keep them forever" },
    { icon: Zap, text: "Auto-collect drops as you walk past them" },
    { icon: Users, text: "Follow brands and see their private drops" },
    { icon: Wallet, text: "Redeem codes tied to your own wallet" },
  ];

  return (
    <AppShell tabs={false}>
      <div className="absolute left-5 z-20" style={{ top: "calc(var(--ar-top-inset) + 16px)" }}>
        <BackButton />
      </div>
      <div className="ar-scroll relative flex h-full flex-col justify-center px-7">
        <div className="ar-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(60%_46%_at_50%_42%,black,transparent)] opacity-45" />
        <div className="pointer-events-none absolute top-[36%] left-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,hsl(var(--ar-green)/0.2),transparent_64%)] blur-[60px]" />

        <div className="relative">
          {/* Fanned empty cards */}
          <div className="mx-auto mb-7 flex w-fit">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="border-ar-line-bright from-ar-surface-3 to-ar-surface -ml-4 block h-[104px] w-[74px] rounded-[12px] border bg-linear-to-br first:ml-0"
                style={{
                  transform: `rotate(${(i - 1) * 9}deg) translateY(${Math.abs(i - 1) * 5}px)`,
                }}
              />
            ))}
          </div>

          <h1 className="font-hud text-ar-text text-center text-[23px] leading-tight font-bold">
            Start a collection
          </h1>
          <p className="text-ar-dim mx-auto mt-2 max-w-[19rem] text-center text-[13px] leading-relaxed">
            Browse as much as you like. An account is only needed the moment you want to keep
            something.
          </p>

          <ul className="mx-auto mt-6 max-w-[20rem] space-y-2.5">
            {perks.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="border-ar-green/40 bg-ar-green/12 text-ar-green-hot flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border">
                  <Icon size={13} strokeWidth={2.3} />
                </span>
                <span className="text-ar-dim text-[12.5px] leading-snug">{text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7 space-y-2">
            <ArButton variant="primary" size="lg" block icon={Wallet} onClick={onSignIn}>
              Connect wallet
            </ArButton>
            <ArLinkButton href="/map" variant="ghost" size="md" block>
              Keep browsing
            </ArLinkButton>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
