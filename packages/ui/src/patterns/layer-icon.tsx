import {
  Baby,
  Beer,
  Bike,
  BookOpen,
  Building2,
  Bus,
  Camera,
  Church,
  Coffee,
  Dog,
  Dumbbell,
  Flag,
  Fuel,
  GraduationCap,
  HeartPulse,
  Hospital,
  Hotel,
  Landmark,
  MapPin,
  Music,
  Palette,
  Pill,
  School,
  ShieldPlus,
  ShoppingBag,
  Siren,
  SquareParking,
  Star,
  Stethoscope,
  Store,
  Tent,
  Ticket,
  TrainFront,
  Trees,
  Trophy,
  Utensils,
  Volleyball,
  Waves,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../lib/cn";

/**
 * Map layer icons (docs/layers), by the names in LAYER_ICONS (@wadzzo/schemas/layer). The mobile
 * app has the same table for lucide-react-native (apps/mobile/src/lib/layers.ts).
 */
export const LAYER_ICON_COMPONENTS: Record<string, LucideIcon> = {
  Hospital,
  Stethoscope,
  HeartPulse,
  Pill,
  School,
  GraduationCap,
  BookOpen,
  Trophy,
  Volleyball,
  Dumbbell,
  Bike,
  Utensils,
  Coffee,
  Beer,
  ShoppingBag,
  Store,
  Landmark,
  Church,
  Trees,
  Tent,
  Waves,
  Music,
  Ticket,
  Palette,
  Camera,
  Bus,
  TrainFront,
  SquareParking,
  Fuel,
  Hotel,
  Building2,
  Baby,
  Dog,
  Siren,
  ShieldPlus,
  Flag,
  Star,
  MapPin,
};

/** A layer's icon (an unknown name falls back to a map pin). */
export function LayerIcon({
  icon,
  className,
  size = 14,
  strokeWidth = 2.25,
}: {
  icon: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const Icon = LAYER_ICON_COMPONENTS[icon] ?? MapPin;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}

/** A layer's badge: its icon, white, on a disc of its colour. */
export function LayerBadge({
  icon,
  color,
  size = 22,
  className,
}: {
  icon: string;
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full", className)}
      style={{ width: size, height: size, backgroundColor: color, color: "#fff" }}
    >
      <LayerIcon icon={icon} size={Math.round(size * 0.58)} />
    </span>
  );
}
