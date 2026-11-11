import { z } from "zod";

/**
 * Map layers (docs/layers): a brand makes its own (Hospital, School, Sports…); with one selected
 * on its base map, the pins, hotspots and trails it makes go in it. The fan map shows regular
 * (layer-less) ones until a fan picks a layer.
 *
 * A layer's icon is one of these: lucide icon names, drawn by lucide-react on the web and
 * lucide-react-native in the mobile app (which keeps its own copy of this list in
 * `apps/mobile/src/lib/ar/layers.ts`; add an icon in both).
 */
export const LAYER_ICONS = [
  "Hospital",
  "Stethoscope",
  "HeartPulse",
  "Pill",
  "School",
  "GraduationCap",
  "BookOpen",
  "Trophy",
  "Volleyball",
  "Dumbbell",
  "Bike",
  "Utensils",
  "Coffee",
  "Beer",
  "ShoppingBag",
  "Store",
  "Landmark",
  "Church",
  "Trees",
  "Tent",
  "Waves",
  "Music",
  "Ticket",
  "Palette",
  "Camera",
  "Bus",
  "TrainFront",
  "SquareParking",
  "Fuel",
  "Hotel",
  "Building2",
  "Baby",
  "Dog",
  "Siren",
  "ShieldPlus",
  "Flag",
  "Star",
  "MapPin",
] as const;
export type LayerIcon = (typeof LAYER_ICONS)[number];

/** Colours offered in the layer dialog (any #rrggbb is allowed). */
export const LAYER_COLORS = [
  "#E5484D",
  "#F76B15",
  "#FFC53D",
  "#46A758",
  "#12A594",
  "#0090FF",
  "#3E63DD",
  "#8E4EC6",
  "#D6409F",
  "#8D8D8D",
] as const;

/** The most layers one brand can have. */
export const MAX_LAYERS_PER_BRAND = 30;
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour");

export const layerFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the layer a name")
    .max(32, "Keep the name under 32 characters"),
  icon: z.enum(LAYER_ICONS, "Pick an icon"),
  color: hexColor,
});
export type LayerFields = z.infer<typeof layerFieldsSchema>;

/** A new layer: an admin working on a brand's map passes the brand; brands leave it out. */
export const createLayerSchema = layerFieldsSchema.extend({
  creatorId: z.string().min(1).optional(),
});
export const updateLayerSchema = layerFieldsSchema.extend({ id: z.string().min(1) });

/**
 * The layer a new or edited pin, hotspot or trail goes in: an id, or null for "No layer" (a
 * regular one). Left out (undefined) means "no change" on edits and "no layer" on creates.
 */
export const layerIdInput = z.string().min(1).max(64).nullable().optional();

/** What a fan client gets about a pin's layer. */
export type PinLayerRef = { id: string; name: string; icon: string; color: string };
