import { Frame, QrCode, ScanLine, type LucideIcon } from "lucide-react";

/**
 * The camera's three ways in — same list as the mobile app's
 * `components/camera/modes.ts`. `href: null` = not built yet (shown, marked
 * "Soon", not openable).
 */
export type CameraModeId = "ar" | "qr" | "murals";
export type CameraPerm = "camera" | "location";

export type CameraModeDef = {
  id: CameraModeId;
  href: "/ar" | "/scan" | "/murals" | null;
  label: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  /** CSS custom property holding the accent's HSL triple. */
  accent: "--ar-green" | "--rarity-rare" | "--rarity-epic";
  /** Its brighter tone, for icons and small type. */
  accentHot: "--ar-green-hot" | "--rarity-rare" | "--rarity-epic";
  /** Permissions shown as chips (motion rides on location, as on mobile). */
  needs: CameraPerm[];
};

export const CAMERA_MODES: CameraModeDef[] = [
  {
    id: "ar",
    href: "/ar",
    label: "AR",
    title: "Augmented Reality",
    blurb: "Look around — drops appear right where they are in the world.",
    icon: ScanLine,
    accent: "--ar-green",
    accentHot: "--ar-green-hot",
    needs: ["camera", "location"],
  },
  {
    id: "qr",
    href: "/scan",
    label: "QR",
    title: "QR Scan",
    blurb: "Scan a printed Wadzzo code. Works indoors.",
    icon: QrCode,
    accent: "--rarity-rare",
    accentHot: "--rarity-rare",
    needs: ["camera"],
  },
  {
    id: "murals",
    href: "/murals",
    label: "Murals",
    title: "Murals",
    blurb: "Scan murals and street art to earn Wadzzo Coins.",
    icon: Frame,
    accent: "--rarity-epic",
    accentHot: "--rarity-epic",
    needs: ["camera", "location"],
  },
];

/** `hsl(var(--x) / a)` for a mode accent. */
export const tone = (v: string, alpha = 1) => `hsl(var(${v}) / ${alpha})`;
