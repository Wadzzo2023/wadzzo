import { redirect } from "next/navigation";

// Trails are hidden for now; the old link goes back to /admin.
export default function Page() {
  redirect("/admin");
}
