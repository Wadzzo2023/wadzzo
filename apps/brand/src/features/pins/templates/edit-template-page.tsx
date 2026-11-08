"use client";

import { LayoutTemplate } from "lucide-react";
import Link from "next/link";

import { Button } from "@wadzzo/ui/poster/button";
import { EmptyState } from "@wadzzo/ui/poster/empty-state";
import { CenteredSpinner } from "@wadzzo/ui/patterns/spinner";

import { api } from "~/utils/api";

import NewHotspotPage from "../new-hotspot-page";
import NewPinPage from "../new-pin-page";

/** Pins › Templates › Edit: the pin or hotspot form, editing the saved template. */
export default function EditTemplatePage({ id }: { id: string }) {
  const q = api.maps.template.get.useQuery({ id }, { retry: false });

  if (q.isLoading) return <CenteredSpinner />;
  if (!q.data)
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <EmptyState
          icon={LayoutTemplate}
          title="Template not found"
          description="It may have been deleted."
          action={
            <Button asChild>
              <Link href="/pins/templates">Back to templates</Link>
            </Button>
          }
        />
      </div>
    );
  // keyed by id and version, so a fresh copy of the form opens for each template
  const key = `${q.data.id}:${String(q.data.updatedAt)}`;
  return q.data.formType === "PIN" ? (
    <NewPinPage key={key} editTemplate={q.data} />
  ) : (
    <NewHotspotPage key={key} editTemplate={q.data} />
  );
}
