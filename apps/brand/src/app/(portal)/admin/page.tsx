import { redirect } from "next/navigation";

import { ADMIN_HOME } from "~/components/shell/access-rules";

export default function AdminPage() {
  redirect(ADMIN_HOME);
}
