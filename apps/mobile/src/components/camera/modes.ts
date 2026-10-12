import { Frame, QrCode, ScanLine, type LucideIcon } from "lucide-react-native";

import type { PermKey } from "~/lib/camera/permissions";
import type { TokenName } from "~/theme/tokens";

/**
 * The camera's three ways in — the launcher's cards and the switch at the top
 * of every camera screen both read this list, so they can't drift apart.
 * `href: null` = not built yet (shown, marked "Soon", not openable).
 */
export type CameraModeId = "ar" | "qr" | "murals";

export type CameraModeDef = {
  id: CameraModeId;
  href: "/ar" | "/scan" | "/murals" | null;
  /** Short name for the switch. */
  label: string;
  /** Full name for the launcher card. */
  title: string;
  blurb: string;
  icon: LucideIcon;
  accent: TokenName;
  needs: PermKey[];
};

export const CAMERA_MODES: CameraModeDef[] = [
  {
    id: "ar",
    href: "/ar",
    label: "AR",
    title: "Augmented Reality",
    blurb: "Look around — drops appear right where they are in the world.",
    icon: ScanLine,
    accent: "ar-green",
    needs: ["camera", "location", "motion"],
  },
  {
    id: "qr",
    href: "/scan",
    label: "QR",
    title: "QR Scan",
    blurb: "Scan a printed Wadzzo code. Works indoors.",
    icon: QrCode,
    accent: "rarity-rare",
    needs: ["camera"],
  },
  {
    id: "murals",
    href: "/murals",
    label: "Murals",
    title: "Murals",
    blurb: "Scan murals and street art to earn Wadzzo Coins.",
    icon: Frame,
    accent: "rarity-epic",
    needs: ["camera", "location", "motion"],
  },
];

export const cameraMode = (id: CameraModeId) => CAMERA_MODES.find((m) => m.id === id)!;
