import { Suspense } from "react";

import EditTemplatePage from "~/features/pins/templates/edit-template-page";
import { CenteredSpinner } from "@wadzzo/ui/patterns/spinner";

export const metadata = { title: "Edit template" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <EditTemplatePage id={id} />
    </Suspense>
  );
}
