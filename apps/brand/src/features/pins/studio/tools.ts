import {
  Hexagon,
  ImageUp,
  MousePointer2,
  PenTool,
  Sparkles,
  Spline,
  type LucideIcon,
} from "lucide-react";

export type Tool = "select" | "pen" | "freehand" | "shapes" | "trace" | "ai";

export const TOOLS: { id: Tool; label: string; icon: LucideIcon; hint: string }[] = [
  {
    id: "select",
    label: "Select",
    icon: MousePointer2,
    hint: "Move points · click a point to change it",
  },
  {
    id: "pen",
    label: "Pen",
    icon: PenTool,
    hint: "Click for a corner · press and drag for a curve",
  },
  { id: "freehand", label: "Freehand", icon: Spline, hint: "Drag to draw the whole shape" },
  { id: "shapes", label: "Shapes", icon: Hexagon, hint: "Start from a shape and adjust it" },
  { id: "trace", label: "Trace", icon: ImageUp, hint: "Turn an image into an outline" },
  { id: "ai", label: "AI", icon: Sparkles, hint: "Describe it, optionally with a reference" },
];
