import {
  ChakraPetch_400Regular,
  ChakraPetch_500Medium,
  ChakraPetch_600SemiBold,
  ChakraPetch_700Bold,
} from "@expo-google-fonts/chakra-petch";
import { BungeeShade_400Regular } from "@expo-google-fonts/bungee-shade";
import {
  Sora_300Light,
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
} from "@expo-google-fonts/sora";

/**
 * The web's three families (`wadzzoAR/src/lib/fonts.ts`): Chakra Petch for
 * HUD/display, Sora for body, Bungee Shade for creator titles.
 */
export const FONT_ASSETS = {
  ChakraPetch_400Regular,
  ChakraPetch_500Medium,
  ChakraPetch_600SemiBold,
  ChakraPetch_700Bold,
  Sora_300Light,
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  BungeeShade_400Regular,
};

type Role = "hud" | "body" | "creator";

const FILES: Record<Role, Record<number, string>> = {
  hud: {
    400: "ChakraPetch_400Regular",
    500: "ChakraPetch_500Medium",
    600: "ChakraPetch_600SemiBold",
    700: "ChakraPetch_700Bold",
  },
  body: {
    300: "Sora_300Light",
    400: "Sora_400Regular",
    500: "Sora_500Medium",
    600: "Sora_600SemiBold",
    700: "Sora_700Bold",
  },
  creator: { 400: "BungeeShade_400Regular" },
};

const WEIGHTS: Record<string, number> = {
  normal: 400,
  bold: 700,
};

/**
 * React Native can't choose a weight inside a custom family — each weight is
 * its own font file. Map (role, weight) to the nearest loaded file.
 */
export function resolveFont(role: string | undefined, weight: string | number | undefined) {
  const r: Role = role === "hud" || role === "creator" ? role : "body";
  const w =
    typeof weight === "number"
      ? weight
      : (WEIGHTS[weight ?? ""] ?? (Number(weight ?? 400) || 400));
  const table = FILES[r];
  const available = Object.keys(table).map(Number);
  const nearest = available.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
  return table[nearest]!;
}
