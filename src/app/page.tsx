import { redirect } from "next/navigation";

/**
 * The map is the app's home. Redirecting on the server rather than routing on
 * the client keeps `/` from painting an empty frame first — and the boot
 * sequence plays over the map itself, so there's nothing to show here.
 */
export default function Index() {
  redirect("/map");
}
