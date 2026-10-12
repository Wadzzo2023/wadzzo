import { Suspense } from "react";

import Page from "~/features/admin/murals-page";
import { CenteredSpinner } from "@wadzzo/ui/patterns/spinner";

export const metadata = { title: "Mural review" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page />
    </Suspense>
  );
}
