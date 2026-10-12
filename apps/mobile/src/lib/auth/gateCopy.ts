// Ported from wadzzoAR/src/lib/ar/store.ts (GateIntent + GATE_COPY) — same wording as the web.

export type GateIntent =
  | "collect"
  | "follow"
  | "profile"
  | "settings"
  | "redeem"
  | "ar"
  | "bounty"
  | "events"
  | "murals";

export const GATE_COPY: Record<GateIntent, { title: string; body: string }> = {
  collect: {
    title: "Sign in to collect",
    body: "You're standing close enough — you just need a wallet to keep what you capture.",
  },
  follow: {
    title: "Sign in to follow",
    body: "Following a brand puts their private drops on your map and keeps their pins at the top.",
  },
  profile: {
    title: "Sign in to see your profile",
    body: "Your collection, your stats, and your redeem codes all live behind your wallet.",
  },
  settings: {
    title: "Sign in to change settings",
    body: "Auto-collect and map preferences are saved to your account.",
  },
  redeem: {
    title: "Sign in to redeem",
    body: "Redeem codes are tied to the wallet that collected the pin.",
  },
  murals: {
    title: "Sign in to collect this mural",
    body: "Finding street art is free for everyone — collecting it and earning Wadzzo Coins needs an account.",
  },
  bounty: {
    title: "Sign in to take part",
    body: "Joining a bounty, sending an entry and talking to the brand all happen from your wallet — it's also where any reward lands.",
  },
  events: {
    title: "Sign in to join in",
    body: "RSVPs and comments are saved to your account, so the brand knows who's coming.",
  },
  ar: {
    title: "Sign in to capture",
    body: "Look around in AR as much as you like — capturing a pin needs an account.",
  },
};
