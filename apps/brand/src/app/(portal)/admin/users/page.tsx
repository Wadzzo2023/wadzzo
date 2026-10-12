import { Suspense } from "react";

import Page from "~/features/admin/users-page";
import { CenteredSpinner } from "@wadzzo/ui/patterns/spinner";

export const metadata = { title: "Users" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page />
    </Suspense>
  );
}
