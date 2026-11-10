// Trail mode's working copy (docs/trails): the whole trail is held here while the brand builds
// it, with undo/redo, and saved in one call. Nothing reaches the server until "Save".

import { create } from "zustand";

import { straightSections, type TrailSection } from "@wadzzo/geo/trail-geometry";
import { cutTrack, fitPoints } from "@wadzzo/geo/trail-track";
import { MAX_SECTION_POINTS } from "@wadzzo/schemas/trail";
import type {
  NewStopPin,
  StopDefaults,
  TrailMode,
  TrailOrder,
  TrailStatus,
} from "@wadzzo/schemas/trail";

export type DraftStop = {
  /** The pin (location group). */
  pinId: string;
  title: string;
  lat: number;
  lng: number;
  image?: string | null;
  required: boolean;
  clue: string | null;
  /** A New stop not saved yet (`pinId` is `new:…`): the pin made when the trail is saved. */
  newPin?: NewStopPin;
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
  /**
   * Shaped sections per pair of stops ("a>b"): street paths, hand-drawn lines or pieces of an
   * imported GPX track. A pair with none is a straight line.
   */
  routes: Record<string, TrailSection>;
  /** How each shaped section was made (for its label); unknown for trails saved earlier. */
  kinds?: Record<string, SectionKind>;
  /** An imported GPX track, shown as a guide while building; not saved (its pieces are). */
  track?: [number, number][] | null;
  stopDefaults: StopDefaults;
  reward: DraftReward | null;
};

/** How a shaped section was made. */
export type SectionKind = "streets" | "drawn" | "track";

/** A section being drawn by hand: the pair it joins and the bends clicked so far. */
export type DrawingSection = { key: string; index: number; points: [number, number][] };

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

/** What a section is: straight, or how it was shaped ("path" when saved before kinds existed). */
export function sectionKindOf(d: Pick<TrailDraft, "routes" | "kinds">, key: string) {
  if (!d.routes[key]) return "straight" as const;
  return d.kinds?.[key] ?? ("path" as const);
}

/** The path with the section being drawn shown as it stands (stop, the bends, next stop). */
export function previewPath(d: TrailDraft, drawing: DrawingSection | null): TrailSection[] {
  const path = draftPath(d);
  if (!drawing) return path;
  const a = d.stops[drawing.index];
  const b = d.stops[drawing.index + 1];
  if (!a || !b) return path;
  return path.map((s, i) =>
    i === drawing.index ? [[a.lng, a.lat], ...drawing.points, [b.lng, b.lat]] : s,
  );
}

type BuilderState = {
  draft: TrailDraft | null;
  /** Drawing one section by hand: map clicks add bends to it. */
  drawing: DrawingSection | null;
  startDrawing: (index: number) => void;
  addBend: (p: [number, number]) => void;
  undoBend: () => void;
  /** Keep what was drawn (one undoable change). */
  finishDrawing: () => void;
  cancelDrawing: () => void;
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

export const useTrailBuilder = create<BuilderState>((set, get) => ({
  draft: null,
  drawing: null,
  startDrawing: (index) => {
    const d = get().draft;
    const a = d?.stops[index];
    const b = d?.stops[index + 1];
    if (!d || !a || !b) return;
    const key = sectionKey(a, b);
    // Start from the bends already there, so a drawn line can be extended or trimmed.
    const current = d.kinds?.[key] === "drawn" ? (d.routes[key]?.slice(1, -1) ?? []) : [];
    set({ drawing: { key, index, points: current } });
  },
  addBend: (p) =>
    set((s) =>
      s.drawing && s.drawing.points.length < MAX_SECTION_POINTS - 2
        ? { drawing: { ...s.drawing, points: [...s.drawing.points, p] } }
        : s,
    ),
  undoBend: () =>
    set((s) =>
      s.drawing ? { drawing: { ...s.drawing, points: s.drawing.points.slice(0, -1) } } : s,
    ),
  finishDrawing: () => {
    const { drawing, draft, change } = get();
    if (!drawing || !draft) return set({ drawing: null });
    const a = draft.stops[drawing.index];
    const b = draft.stops[drawing.index + 1];
    set({ drawing: null });
    if (!a || !b) return;
    change((d) =>
      drawing.points.length
        ? setSection(d, drawing.key, [[a.lng, a.lat], ...drawing.points, [b.lng, b.lat]], "drawn")
        : setSection(d, drawing.key, null),
    );
  },
  cancelDrawing: () => set({ drawing: null }),
  clean: true,
  past: [],
  future: [],
  open: (d) => set({ draft: d, drawing: null, clean: true, past: [], future: [] }),
  close: () => set({ draft: null, drawing: null, clean: true, past: [], future: [] }),
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
  // New stops' pins were made by this save: their `new:` ids are gone, so is the history
  // that holds them (undoing to one would make its pin again).
  saved: (d) =>
    set((st) =>
      st.draft?.stops.some((x) => x.newPin)
        ? { draft: d, clean: true, past: [], future: [] }
        : { draft: d, clean: true },
    ),
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

/** With a GPX track loaded, sections between stops near it follow it as the stops change. */
const alongTrack = (d: TrailDraft): TrailDraft => (d.track ? followTrack(d).draft : d);

export const addStop = (d: TrailDraft, stop: DraftStop): TrailDraft =>
  d.stops.some((s) => s.pinId === stop.pinId) ? d : alongTrack({ ...d, stops: [...d.stops, stop] });

export const removeStop = (d: TrailDraft, pinId: string): TrailDraft =>
  alongTrack({ ...d, stops: d.stops.filter((s) => s.pinId !== pinId) });

export const moveStop = (d: TrailDraft, from: number, to: number): TrailDraft => {
  if (to < 0 || to >= d.stops.length || from === to) return d;
  const stops = [...d.stops];
  const [s] = stops.splice(from, 1);
  stops.splice(to, 0, s!);
  return alongTrack({ ...d, stops });
};

export const updateStop = (
  d: TrailDraft,
  pinId: string,
  patch: Partial<DraftStop>,
): TrailDraft => ({
  ...d,
  stops: d.stops.map((s) => (s.pinId === pinId ? { ...s, ...patch } : s)),
});

/** Shape one section (null: back to a straight line). */
export function setSection(
  d: TrailDraft,
  key: string,
  section: TrailSection | null,
  kind?: SectionKind,
): TrailDraft {
  const routes = { ...d.routes };
  const kinds = { ...d.kinds };
  if (section) {
    routes[key] = section;
    if (kind) kinds[key] = kind;
  } else {
    delete routes[key];
    delete kinds[key];
  }
  return { ...d, routes, kinds };
}

/**
 * The imported track laid along the stops: every section whose two stops are near the track
 * follows it. As stops change only straight sections (and earlier track pieces) are redone, so
 * streets and drawn sections are kept; `all` (a fresh import) lays the track over every
 * section. Returns the draft and how many sections now follow the track out of those tried.
 */
export function followTrack(
  d: TrailDraft,
  all = false,
): { draft: TrailDraft; followed: number; tried: number } {
  if (!d.track || d.stops.length < 2) return { draft: d, followed: 0, tried: 0 };
  const pieces = cutTrack(d.track, d.stops);
  let next = d;
  let followed = 0;
  let tried = 0;
  pieces.forEach((piece, i) => {
    const key = sectionKey(d.stops[i]!, d.stops[i + 1]!);
    const kind = sectionKindOf(d, key);
    if (!all && kind !== "straight" && kind !== "track") return;
    tried++;
    if (!piece) return;
    followed++;
    next = setSection(next, key, fitPoints(piece, MAX_SECTION_POINTS), "track");
  });
  return { draft: next, followed, tried };
}

/** Reverse the walking direction; routed sections are kept, walked the other way. */
export const reverseStops = (d: TrailDraft): TrailDraft => {
  const routes = { ...d.routes };
  const kinds = { ...d.kinds };
  for (const [key, section] of Object.entries(d.routes)) {
    const [a, b] = key.split(">");
    const back = `${b}>${a}`;
    if (!routes[back]) {
      routes[back] = [...section].reverse();
      const kind = d.kinds?.[key];
      if (kind) kinds[back] = kind;
    }
  }
  return alongTrack({ ...d, stops: [...d.stops].reverse(), routes, kinds });
};

/**
 * The draft after a save: new stops take the ids of the pins the save made (the server's stops
 * are in the same order), with their sections re-keyed, and their `newPin` dropped.
 */
export function adoptSaved(
  d: TrailDraft,
  saved: { id: string; updatedAt: Date; status: TrailStatus; stopPinIds: string[] },
): TrailDraft {
  const ids = new Map<string, string>();
  const stops = d.stops.map((s, i) => {
    const real = saved.stopPinIds[i];
    if (!s.newPin || !real) return s;
    ids.set(s.pinId, real);
    const { newPin: _made, ...rest } = s;
    return { ...rest, pinId: real };
  });
  const rekey = <T>(m: Record<string, T> | undefined) =>
    m &&
    Object.fromEntries(
      Object.entries(m).map(([k, v]) => {
        const [a, b] = k.split(">");
        return [`${ids.get(a!) ?? a}>${ids.get(b!) ?? b}`, v];
      }),
    );
  return {
    ...d,
    id: saved.id,
    updatedAt: saved.updatedAt,
    status: saved.status,
    stops,
    routes: rekey(d.routes) ?? {},
    kinds: rekey(d.kinds),
  };
}
