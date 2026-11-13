import { redirect } from "next/navigation";

// Trails are hidden for now: /trails and /trails/[id] go to the map. The screens are kept.
export default function TrailsLayout() {
  redirect("/map");
}
