// Trail mode's working copy (docs/trails): the whole trail is held here while the brand builds
// it, with undo/redo, and saved in one call. Nothing reaches the server until "Save".

import { create } from "zustand";

import { straightSections, type TrailSection } from "@wadzzo/geo/trail-geometry";
import type { StopDefaults, TrailMode, TrailOrder, TrailStatus } from "@wadzzo/schemas/trail";

export type DraftStop = {
  /** The pin (location group). */
  pinId: string;
  title: string;
  lat: number;
  lng: number;
  image?: string | null;
  required: boolean;
  clue: string | null;
};

export type DraftReward = { assetId: number; limit: number; minStops: number | null };

export type TrailDraft = {
  id?: string;
  updatedAt?: Date;
  creatorId?: string;
  status: TrailStatus;
  reviewNote?: string | null;
  title: string;
  description: string;
  coverImage: string | null;
  mode: TrailMode;
  order: TrailOrder;
  color: string;
  startDate: Date;
  endDate: Date;
  stops: DraftStop[];
  /** Street paths found by "Snap to streets", per pair of stops ("a>b"); others are straight. */
  routes: Record<string, TrailSection>;
  stopDefaults: StopDefaults;
  reward: DraftReward | null;
};

const MAX_HISTORY = 60;

export const sectionKey = (a: { pinId: string }, b: { pinId: string }) => `${a.pinId}>${b.pinId}`;

/** The path for the stops in order: each section routed when it has been, straight otherwise. */
export function draftPath(d: Pick<TrailDraft, "stops" | "routes">): TrailSection[] {
  const straight = straightSections(d.stops);
  return straight.map((s, i) => d.routes[sectionKey(d.stops[i]!, d.stops[i + 1]!)] ?? s);
}

/** Sections still drawn straight (for "Snap to streets"). */
export function unroutedPairs(d: Pick<TrailDraft, "stops" | "routes">) {
  const pairs: [DraftStop, DraftStop][] = [];
  for (let i = 1; i < d.stops.length; i++) {
    const a = d.stops[i - 1]!;
    const b = d.stops[i]!;
    if (!d.routes[sectionKey(a, b)]) pairs.push([a, b]);
  }
  return pairs;
}

type BuilderState = {
  draft: TrailDraft | null;
  /** Saved as it is now (no unsaved changes). */
  clean: boolean;
  past: TrailDraft[];
  future: TrailDraft[];
  open: (d: TrailDraft) => void;
  close: () => void;
  /** One undoable change. */
  change: (fn: (d: TrailDraft) => TrailDraft) => void;
  /** After a save: the server's copy, without touching history. */
  saved: (d: TrailDraft) => void;
  undo: () => void;
  redo: () => void;
};

export const useTrailBuilder = create<BuilderState>((set) => ({
  draft: null,
  clean: true,
  past: [],
  future: [],
  open: (d) => set({ draft: d, clean: true, past: [], future: [] }),
  close: () => set({ draft: null, clean: true, past: [], future: [] }),
  change: (fn) =>
    set((s) => {
      if (!s.draft) return s;
      const next = fn(s.draft);
      if (next === s.draft) return s;
      return {
        draft: next,
        clean: false,
        past: [...s.past, s.draft].slice(-MAX_HISTORY),
        future: [],
      };
    }),
  saved: (d) => set({ draft: d, clean: true }),
  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev || !s.draft) return s;
      return {
        draft: prev,
        past: s.past.slice(0, -1),
        future: [s.draft, ...s.future],
        clean: false,
      };
    }),
  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next || !s.draft) return s;
      return { draft: next, past: [...s.past, s.draft], future: s.future.slice(1), clean: false };
    }),
}));

// ── Changes ─────────────────────────────────────────────────────────────

export const addStop = (d: TrailDraft, stop: DraftStop): TrailDraft =>
  d.stops.some((s) => s.pinId === stop.pinId) ? d : { ...d, stops: [...d.stops, stop] };

export const removeStop = (d: TrailDraft, pinId: string): TrailDraft => ({
  ...d,
  stops: d.stops.filter((s) => s.pinId !== pinId),
});

export const moveStop = (d: TrailDraft, from: number, to: number): TrailDraft => {
  if (to < 0 || to >= d.stops.length || from === to) return d;
  const stops = [...d.stops];
  const [s] = stops.splice(from, 1);
  stops.splice(to, 0, s!);
  return { ...d, stops };
};

export const updateStop = (
  d: TrailDraft,
  pinId: string,
  patch: Partial<DraftStop>,
): TrailDraft => ({
  ...d,
  stops: d.stops.map((s) => (s.pinId === pinId ? { ...s, ...patch } : s)),
});

/** Reverse the walking direction; routed sections are kept, walked the other way. */
export const reverseStops = (d: TrailDraft): TrailDraft => {
  const routes = { ...d.routes };
  for (const [key, section] of Object.entries(d.routes)) {
    const [a, b] = key.split(">");
    routes[`${b}>${a}`] ??= [...section].reverse();
  }
  return { ...d, stops: [...d.stops].reverse(), routes };
};
