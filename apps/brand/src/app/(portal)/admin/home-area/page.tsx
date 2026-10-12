import { Suspense } from "react";

import { HomeAreaAdminPage } from "~/features/home-area/home-area-pages";
import { CenteredSpinner } from "@wadzzo/ui/patterns/spinner";

export const metadata = { title: "Home area" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <HomeAreaAdminPage />
    </Suspense>
  );
}
