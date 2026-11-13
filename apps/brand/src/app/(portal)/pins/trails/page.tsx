import { redirect } from "next/navigation";

// Trails are hidden for now; the old link goes back to /pins.
export default function Page() {
  redirect("/pins");
}
