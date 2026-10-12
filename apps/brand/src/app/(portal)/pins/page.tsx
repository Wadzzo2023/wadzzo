import { Suspense } from "react";

import PinsPage from "~/features/pins/pins-page";
import { CenteredSpinner } from "@wadzzo/ui/patterns/spinner";

export const metadata = { title: "Pins" };

export default function Page() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <PinsPage />
    </Suspense>
  );
}
