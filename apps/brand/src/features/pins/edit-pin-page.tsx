"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { PinType } from "@wadzzo/db";
import { Calendar, Loader2, MapPin, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, FormProvider, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import type { z } from "zod";

import { MapPicker } from "~/components/map-kit/map-picker";
import { updateMapFormSchema } from "@wadzzo/schemas/pin-edit";
import { ImageUploadField } from "~/components/pins/pin-form-parts";
import { Button } from "@wadzzo/ui/poster/button";
import { Input } from "@wadzzo/ui/poster/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wadzzo/ui/poster/select";
import { Switch } from "@wadzzo/ui/components/switch";
import { Textarea } from "@wadzzo/ui/poster/textarea";
import { EmptyState } from "@wadzzo/ui/poster/empty-state";
import { AiTextButton } from "~/ui/ai/ai-text";
import { useFormCard } from "~/ui/form-card";
import { CardTab, Field, FormPage, FormSection } from "~/ui/form-page";
import { SpotNote } from "./spot-note";
import { FormSkeleton } from "@wadzzo/ui/patterns/skeleton";
import { api, type RouterOutputs } from "~/utils/api";
import { usePortalAccess } from "~/components/shell/use-portal-access";
import { toastFormErrors } from "~/utils/form-errors";

import {
  PinLookSection,
  toLookValue,
  usePinLookMarker,
  type PinLookValue,
} from "./look/pin-look-section";
import { LayerField } from "./layers/layer-field";

type EditForm = z.infer<typeof updateMapFormSchema>;

/** The form's tabs in a map card (~/ui/form-card). */
const CARD_TABS = [
  { id: "details", label: "Details" },
  { id: "look", label: "Look" },
  { id: "collect", label: "Collect" },
  { id: "schedule", label: "Schedule" },
];

type Pin = RouterOutputs["maps"]["pin"]["myPinForEdit"];

const toInput = (d?: Date) => {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const typeLabel = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

/**
 * Pins › Edit pin: details, location, schedule and collection options on one page, or in a
 * floating card on the base map (see ~/ui/form-card).
 */
export default function EditPinPage({ id }: { id: string }) {
  const pin = api.maps.pin.myPinForEdit.useQuery(id, { retry: false });
  const { isAdmin } = usePortalAccess();
  const card = useFormCard();
  if (pin.isLoading) {
    return card ? (
      <div className="bg-card text-muted-foreground flex w-full items-center gap-2 rounded-[1.2rem] border-2 p-4 text-sm shadow-lg lg:w-[380px]">
        <Loader2 className="size-4 animate-spin" /> Opening pin…
      </div>
    ) : (
      <FormSkeleton />
    );
  }
  if (!pin.data && card)
    return (
      <div className="bg-card flex w-full items-center gap-2 rounded-[1.2rem] border-2 p-4 text-sm shadow-lg lg:w-[380px]">
        <span className="flex-1">That pin couldn&apos;t be opened. It may have been deleted.</span>
        <Button size="sm" variant="ghost" onClick={card.onClose}>
          Close
        </Button>
      </div>
    );
  if (!pin.data)
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <EmptyState
          icon={MapPin}
          title="Pin not found"
          description={
            isAdmin
              ? "This pin may have been deleted."
              : "It may have been deleted, or it belongs to another brand."
          }
          action={
            <Button asChild>
              <Link href={isAdmin ? "/admin/pins" : "/pins"}>
                {isAdmin ? "Back to pin review" : "Back to pins"}
              </Link>
            </Button>
          }
        />
      </div>
    );
  return <EditPinForm pin={pin.data} />;
}

function EditPinForm({ pin }: { pin: Pin }) {
  const router = useRouter();
  const card = useFormCard();
  const [look, setLook] = useState<PinLookValue>(() => toLookValue(pin.look));
  const { isAdmin } = usePortalAccess();
  const backHref = isAdmin ? "/admin/pins" : "/pins";
  const backLabel = isAdmin ? "Pin review" : "Pins";

  const methods = useForm<z.input<typeof updateMapFormSchema>, unknown, EditForm>({
    resolver: zodResolver(updateMapFormSchema),
    defaultValues: {
      pinId: pin.id,
      title: pin.title,
      description: pin.description,
      image: pin.image,
      type: pin.type,
      url: pin.url || undefined,
      startDate: pin.startDate,
      endDate: pin.endDate,
      lat: pin.lat,
      lng: pin.lng,
      autoCollect: pin.autoCollect,
      multiPin: pin.multiPin,
      pinRemainingLimit: pin.remaining,
      // A hotspot's drop follows its hotspot's layer: edited on the hotspot, not here.
      layerId: pin.hotspotId ? undefined : pin.layerId,
    },
  });
  const { register, handleSubmit, setValue, watch, control, formState } = methods;
  const { errors } = formState;
  const values = watch();
  // Card: a click on the base map moves the pin there.
  const cardAt = card?.at;
  useEffect(() => {
    if (!cardAt) return;
    setValue("lat", cardAt.lat, { shouldValidate: true, shouldDirty: true });
    setValue("lng", cardAt.lng, { shouldValidate: true, shouldDirty: true });
  }, [cardAt, setValue]);

  const utils = api.useUtils();
  const update = api.maps.pin.updatePin.useMutation({
    onSuccess: () => {
      void utils.maps.pin.getMyPins.invalidate();
      void utils.maps.pin.getCreatorPins.invalidate();
      void utils.maps.pin.myPinForEdit.invalidate(pin.id);
      void utils.maps.pin.getAdminLocationGroups.invalidate();
      void utils.maps.layer.list.invalidate();
      toast.success("Pin updated");
      if (card) card.onDone();
      else router.push(backHref);
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = handleSubmit(
    (data) =>
      update.mutate({
        ...data,
        description: data.description ?? "",
        url: data.url ?? undefined,
        look,
      }),
    toastFormErrors,
  );

  // The location map shows the pin with its chosen look, as fans will see it.
  const pinOnMap = usePinLookMarker(look, {
    autoCollect: Boolean(values.autoCollect),
    pinImage: values.image || null,
    creatorId: pin.creatorId,
    brandImage: pin.brandImage,
  });

  const actions = (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => (card ? card.onClose() : router.push(backHref))}
      >
        Cancel
      </Button>
      <Button type="submit" disabled={update.isPending}>
        {update.isPending && <Loader2 className="animate-spin" />}
        Save changes
      </Button>
    </>
  );

  return (
    <FormProvider {...methods}>
      <FormPage
        title="Edit pin"
        icon={MapPin}
        description={
          isAdmin && pin.creatorName
            ? `Editing pin for creator "${pin.creatorName}".`
            : pin.approved === null
              ? "This pin is waiting for review."
              : "Changes go live straight away."
        }
        back={{ href: backHref, label: backLabel }}
        onSubmit={(e) => void onSubmit(e)}
        actions={actions}
        cardTabs={CARD_TABS}
        aside={
          <FormSection
            title="Location"
            icon={MapPin}
            description="Click the map, drag the pin, search, or type coordinates."
          >
            <MapPicker
              value={{ lat: values.lat, lng: values.lng }}
              marker={pinOnMap.marker}
              markerAnchor={pinOnMap.anchor}
              onChange={(v) => {
                setValue("lat", v.lat, {
                  shouldValidate: true,
                  shouldDirty: true,
                });
                setValue("lng", v.lng, {
                  shouldValidate: true,
                  shouldDirty: true,
                });
              }}
            />
            {(errors.lat ?? errors.lng) && (
              <p className="text-destructive text-xs">Choose a valid location.</p>
            )}
          </FormSection>
        }
      >
        {card && (
          <CardTab tab="details">
            <SpotNote at={{ lat: values.lat, lng: values.lng }} />
          </CardTab>
        )}
        <FormSection title="Details" icon={Sparkles} tab="details">
          <Field
            label="Title"
            htmlFor="title"
            required
            error={errors.title?.message}
            action={
              <AiTextButton
                form="pin"
                field="title"
                maxChars={60}
                value={values.title ?? ""}
                context={{ description: values.description ?? "" }}
                onChange={(t) =>
                  setValue("title", t, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              />
            }
          >
            <Input id="title" {...register("title")} />
          </Field>
          <Field
            label="Description"
            htmlFor="description"
            error={errors.description?.message}
            action={
              <AiTextButton
                form="pin"
                field="description"
                value={values.description ?? ""}
                context={{ title: values.title ?? "" }}
                onChange={(t) => setValue("description", t, { shouldDirty: true })}
              />
            }
          >
            <Textarea
              id="description"
              rows={4}
              className="resize-none"
              {...register("description")}
            />
          </Field>
          <div className="grid gap-4 @md:grid-cols-2">
            <Field label="Pin type">
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(PinType).map((t) => (
                        <SelectItem key={t} value={t}>
                          {typeLabel(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field
              label="Link"
              htmlFor="url"
              error={errors.url?.message}
              hint="Optional — where the pin sends fans."
            >
              <Input
                id="url"
                type="url"
                placeholder="https://example.com"
                {...register("url", {
                  setValueAs: (v: string) => v || undefined,
                })}
              />
            </Field>
          </div>
          <ImageUploadField
            value={values.image}
            onChange={(url) => setValue("image", url ?? "", { shouldDirty: true })}
            ai={{
              form: "pin",
              suggestedPrompt: [values.title, values.description?.slice(0, 400)]
                .filter(Boolean)
                .join(". "),
            }}
          />
          {pin.hotspotId ? null : <LayerField creatorId={pin.creatorId} />}
        </FormSection>

        <FormSection title="Schedule" icon={Calendar} tab="schedule">
          <div className="grid gap-4 @md:grid-cols-2">
            {(["startDate", "endDate"] as const).map((name) => (
              <Field
                key={name}
                label={name === "startDate" ? "Starts" : "Ends"}
                error={errors[name]?.message}
              >
                <Controller
                  name={name}
                  control={control}
                  render={({ field }) => (
                    <Input
                      type="datetime-local"
                      value={toInput(field.value)}
                      onChange={(e) =>
                        field.onChange(e.target.value ? new Date(e.target.value) : undefined)
                      }
                    />
                  )}
                />
              </Field>
            ))}
          </div>
        </FormSection>

        <PinLookSection
          tab="look"
          value={look}
          onChange={setLook}
          autoCollect={Boolean(values.autoCollect)}
          pinImage={values.image || null}
          creatorId={pin.creatorId}
          brandImage={pin.brandImage}
        />

        <FormSection title="Collection" icon={Settings} tab="collect">
          <Field
            label="Collections left"
            htmlFor="pinRemainingLimit"
            error={errors.pinRemainingLimit?.message}
            hint={`Of ${pin.limit} in total. Raising it adds to the total.`}
          >
            <Input
              id="pinRemainingLimit"
              type="number"
              min={0}
              step={1}
              className="max-w-[200px]"
              {...register("pinRemainingLimit", { valueAsNumber: true })}
            />
          </Field>
          <div className="divide-y rounded-lg border">
            {(
              [
                [
                  "autoCollect",
                  "Auto collect",
                  "Collected automatically when fans enter the area.",
                ],
                ["multiPin", "Multi pin", "Allow fans to collect more than one pin here."],
              ] as const
            ).map(([name, title, hint]) => (
              <label key={name} className="flex cursor-pointer items-center gap-3 p-4">
                <span className="flex-1">
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="text-muted-foreground block text-xs">{hint}</span>
                </span>
                <Controller
                  name={name}
                  control={control}
                  render={({ field }) => (
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  )}
                />
              </label>
            ))}
          </div>
        </FormSection>

        {update.isError && <p className="text-destructive text-sm">{update.error.message}</p>}
      </FormPage>
    </FormProvider>
  );
}
