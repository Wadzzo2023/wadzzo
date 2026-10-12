import { Redirect } from "expo-router";

/** The app opens on the map, same as the web (`/` → `/map`). */
export default function Index() {
  return <Redirect href="/map" />;
}
