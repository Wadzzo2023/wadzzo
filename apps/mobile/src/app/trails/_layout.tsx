import { Redirect } from "expo-router";

// Trails are hidden for now: /trails and /trails/[id] (deep links too) go to the map.
// The screens are kept.
export default function TrailsLayout() {
  return <Redirect href="/map" />;
}
