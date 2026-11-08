"use client";

import type { z } from "zod";

import { zodResolver } from "@hookform/resolvers/zod";
import { PinType } from "@wadzzo/db";
import {
  Calendar,
  LayoutTemplate,
  Loader2,
  MapPin,
  Save,
  Settings,
  Sparkles,
  Tag,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import toast from "react-hot-toast";

import { MapPicker } from "~/components/map-kit/map-picker";
import {
  CollectionInputs,
  createPinFormSchema,
  ImageUploadField,
  PinTypeToggles,
  TagsSection,
  TiersOptions,
  type AssetType,
  type CreatePinType,
} from "~/components/pins/pin-form-parts";
import { Button } from "@wadzzo/ui/poster/button";
import { Input } from "@wadzzo/ui/poster/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wadzzo/ui/poster/select";
import { Textarea } from "@wadzzo/ui/poster/textarea";
import { Switch } from "@wadzzo/ui/components/switch";
import { Label } from "@wadzzo/ui/components/label";
import { describeMinutes } from "@wadzzo/schemas/pin-template";
import { cn } from "@wadzzo/ui/lib/cn";
import { useMapInteractionStore } from "~/store/map-stores";
import { toastFormErrors } from "~/utils/form-errors";
import { api } from "~/utils/api";
import { AiFillCard } from "~/ui/ai/ai-fill";
import { AiTextButton } from "~/ui/ai/ai-text";
import { fromLocal } from "~/ui/ai/shared";
import { Field, FormPage, FormSection } from "~/ui/form-page";

import {
  loadLastLook,
  PinLookSection,
  usePinLookMarker,
  saveLastLook,
  toLookValue,
  type PinLookValue,
} from "./look/pin-look-section";

import { pinFormToTemplate, templateToPinForm, type PinFormLike } from "./templates/mapping";
import { SaveTemplateDialog } from "./templates/save-template-dialog";
import { TemplatePicker, type PinTemplateRow, type TemplateRow } from "./templates/template-picker";

const toInput = (d?: Date) => {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const toDate = (d?: string | number | Date | null) =>
  d == null ? undefined : d instanceof Date ? d : new Date(d);
const typeLabel = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

const DAY_MINUTES = 24 * 60;

/**
 * Pins › New pin (was the create-pin dialog). One page: collection mode,
 * details, location on a map, collection & tier, schedule, tags. The map
 * and a live summary sit beside the form on desktop.
 *
 * Templates: "Start from template" fills the form, "Save as template" keeps
 * it for later, and `?template=<id>` (from the map or the templates page)
 * opens with one applied. With `editTemplate` the same form edits a saved
 * template instead of creating a pin.
 */
export default function NewPinPage({ editTemplate }: { editTemplate?: PinTemplateRow } = {}) {
  const router = useRouter();
  const search = useSearchParams();
  const { prevData, closeCreatePinModal } = useMapInteractionStore();
  const editing = Boolean(editTemplate);
  const duplicating = !editing && search?.get("duplicate") === "1" && Boolean(prevData);

  const qLat = Number(search?.get("lat"));
  const qLng = Number(search?.get("lng"));
  const fromQuery =
    search?.get("lat") && Number.isFinite(qLat) && Number.isFinite(qLng)
      ? { lat: qLat, lng: qLng }
      : null;

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const blank = (now: Date) => ({
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
    radius: 50,
    pinNumber: 1,
    pinCollectionLimit: 0,
    title: "",
    description: "",
    image: undefined as string | undefined,
    autoCollect: false,
    startDate: now,
    endDate: new Date(now.getTime() + DAY_MINUTES * 60_000),
    multiPin: false,
    type: PinType.OTHER,
    url: "",
    tier: undefined as string | undefined,
    token: undefined as number | undefined,
    tags: [] as string[],
  });

  const methods = useForm<z.input<typeof createPinFormSchema>, unknown, CreatePinType>({
    resolver: zodResolver(createPinFormSchema),
    defaultValues: { ...blank(today), lat: fromQuery?.lat, lng: fromQuery?.lng },
  });
  const { register, handleSubmit, setValue, watch, control, setError, formState, getValues } =
    methods;
  const { errors } = formState;

  const [collectionMode, setCollectionMode] = useState<"manual" | "auto">("manual");
  const [look, setLook] = useState<PinLookValue>(() =>
    toLookValue(editTemplate?.data.look ?? null),
  );
  // A new pin starts from the brand's last look (browser storage, so after mount).
  const lookTouched = useRef(Boolean(editTemplate));
  useEffect(() => {
    if (lookTouched.current) return;
    lookTouched.current = true;
    setLook(loadLastLook());
  }, []);
  const changeLook = (next: PinLookValue) => {
    lookTouched.current = true;
    setLook(next);
  };

  // ── Templates ──────────────────────────────────────────────────────────
  const [saveOpen, setSaveOpen] = useState(false);
  const [appliedName, setAppliedName] = useState<string | null>(null);
  // Editing a template: its name, whether it keeps a location, and how long pins run.
  const [templateName, setTemplateName] = useState(editTemplate?.name ?? "");
  const [keepLocation, setKeepLocation] = useState(editTemplate?.hasLocation ?? false);
  const savedMinutes = editTemplate?.data.durationMinutes ?? DAY_MINUTES;
  const [runDays, setRunDays] = useState(Math.floor(savedMinutes / DAY_MINUTES));
  const [runHours, setRunHours] = useState(Math.floor((savedMinutes % DAY_MINUTES) / 60));
  const runMinutes = Math.max(60, (runDays * 24 + runHours) * 60);

  /**
   * Fill the form from a template. A spot picked on the map wins over the
   * template's location; a template without one keeps the spot already chosen.
   */
  const applyTemplate = (t: TemplateRow, spot?: { lat: number; lng: number } | null) => {
    if (t.formType !== "PIN") return;
    const current = getValues();
    const keep =
      Number.isFinite(current.lat) && Number.isFinite(current.lng)
        ? { lat: current.lat!, lng: current.lng! }
        : null;
    const at = spot ?? (t.data.location ? null : keep);
    const { values: v, mode, look: tLook } = templateToPinForm(t.data, new Date(), at);
    if (tLook) {
      lookTouched.current = true;
      setLook(toLookValue(tLook));
    }
    methods.reset({ ...blank(new Date()), ...v });
    setCollectionMode(mode);
    setAppliedName(t.name);
  };

  // `?template=<id>` (from the map or the templates page) applies it once, at the
  // spot in `?lat=&lng=` if one was picked. Editing opens the template itself.
  const templateId = editing ? null : (search?.get("template") ?? null);
  const linked = api.maps.template.get.useQuery(
    { id: templateId ?? "" },
    { enabled: Boolean(templateId), retry: false },
  );
  const appliedFor = useRef<string | null>(null);
  useEffect(() => {
    const t = editTemplate ?? linked.data;
    if (!t || appliedFor.current === t.id) return;
    appliedFor.current = t.id;
    applyTemplate(t, editing ? null : fromQuery);
    // apply once per template; applyTemplate reads the form at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTemplate, linked.data]);
  useEffect(() => {
    if (linked.isError) toast.error("That template couldn't be opened");
  }, [linked.isError]);

  const utils = api.useUtils();
  const updateTemplate = api.maps.template.update.useMutation({
    onSuccess: (t) => {
      void utils.maps.template.list.invalidate();
      void utils.maps.template.get.invalidate({ id: t.id });
      toast.success("Template saved");
      router.push("/pins/templates");
    },
    onError: (e) => toast.error(e.message),
  });
  const saveEditedTemplate = () => {
    const name = templateName.trim();
    if (!editTemplate || !name) {
      toast.error("Give the template a name");
      return;
    }
    updateTemplate.mutate({
      id: editTemplate.id,
      name,
      data: pinFormToTemplate(getValues() as PinFormLike, {
        mode: collectionMode,
        includeLocation: keepLocation,
        look,
        durationMinutes: runMinutes,
      }),
    });
  };
  const [selectedToken, setSelectedToken] = useState<(AssetType & { bal: number }) | undefined>();
  const [remainingBalance, setRemainingBalance] = useState(0);
  const assetsQuery = api.fan.asset.myAssets.useQuery();

  // Duplicate: pre-fill from the pin the brand chose to copy.
  useEffect(() => {
    if (!duplicating || !prevData) return;
    if (prevData.title) setValue("title", `${prevData.title}`);
    if (prevData.description) setValue("description", prevData.description);
    if (prevData.image) setValue("image", prevData.image);
    if (prevData.radius) setValue("radius", prevData.radius);
    if (prevData.url) setValue("url", prevData.url);
    if (prevData.pinNumber) setValue("pinNumber", prevData.pinNumber);
    setValue("pinCollectionLimit", prevData.pinCollectionLimit ?? 0);
    if (prevData.tier) setValue("tier", prevData.tier.toString());
    setValue("startDate", toDate(prevData.startDate) ?? today);
    setValue("endDate", toDate(prevData.endDate) ?? tomorrow);
    setCollectionMode(prevData.autoCollect ? "auto" : "manual");
    if (prevData.lat && prevData.lng) {
      setValue("lat", prevData.lat);
      setValue("lng", prevData.lng);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicating]);

  const limit = watch("pinCollectionLimit");
  useEffect(() => {
    setRemainingBalance(selectedToken ? selectedToken.bal - (limit ?? 0) : 0);
  }, [limit, selectedToken]);

  const create = api.maps.pin.createPin.useMutation({
    onSuccess: () => {
      closeCreatePinModal();
      saveLastLook(look);
      toast.success("Pin created!");
      router.push("/pins");
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = handleSubmit((data) => {
    if (selectedToken && data.pinCollectionLimit > selectedToken.bal) {
      setError("pinCollectionLimit", {
        message: "Collection limit can't be more than your token balance",
      });
      toast.error("Collection limit can't be more than your token balance");
      return;
    }
    create.mutate({
      ...data,
      autoCollect: collectionMode === "auto",
      look,
      description: data.description ?? "",
    });
  }, toastFormErrors);

  const lat = watch("lat");
  const lng = watch("lng");
  const values = watch();
  const location =
    Number.isFinite(lat) && Number.isFinite(lng) && lat !== undefined && lng !== undefined
      ? { lat, lng }
      : null;

  const [imageBrief, setImageBrief] = useState("");
  const [tagIdeas, setTagIdeas] = useState<string[]>([]);
  const aiContext = {
    title: values.title ?? "",
    description: values.description ?? "",
    type: values.type ?? "",
    location: location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : "",
  };
  const imagePrompt =
    imageBrief || [values.title, values.description?.slice(0, 400)].filter(Boolean).join(". ");

  const actions = editing ? (
    <>
      <Button type="button" variant="ghost" onClick={() => router.push("/pins/templates")}>
        Cancel
      </Button>
      <Button type="submit" disabled={updateTemplate.isPending}>
        {updateTemplate.isPending ? <Loader2 className="animate-spin" /> : <Save />}
        {updateTemplate.isPending ? "Saving…" : "Save template"}
      </Button>
    </>
  ) : (
    <>
      <Button type="button" variant="ghost" onClick={() => router.push("/pins")}>
        Cancel
      </Button>
      <Button type="button" variant="outline" onClick={() => setSaveOpen(true)}>
        <LayoutTemplate /> <span className="hidden sm:inline">Save as template</span>
        <span className="sm:hidden">Template</span>
      </Button>
      <Button type="submit" disabled={create.isPending || remainingBalance < 0}>
        {create.isPending && <Loader2 className="animate-spin" />}
        {create.isPending ? "Creating…" : "Create pin"}
      </Button>
    </>
  );

  // The location map shows the pin with its chosen look, as fans will see it.
  const pinOnMap = usePinLookMarker(look, {
    autoCollect: collectionMode === "auto",
    pinImage: values.image,
  });

  const locationSection = (
    <FormSection
      title="Location"
      icon={MapPin}
      description={
        editing
          ? "Optional — keep a spot with the template, or choose one each time it's used."
          : "Click the map, search, or type coordinates."
      }
    >
      {editing && (
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <Label htmlFor="keep-location" className="text-sm font-medium">
            Save a location with this template
          </Label>
          <Switch id="keep-location" checked={keepLocation} onCheckedChange={setKeepLocation} />
        </div>
      )}
      {(!editing || keepLocation) && (
        <>
          <MapPicker
            value={location}
            marker={pinOnMap.marker}
            markerAnchor={pinOnMap.anchor}
            radiusMetres={values.radius}
            onChange={(v) => {
              setValue("lat", v.lat, { shouldValidate: true });
              setValue("lng", v.lng, { shouldValidate: true });
            }}
          />
          {!editing && (errors.lat ?? errors.lng) && (
            <p className="text-destructive text-xs">Choose where the pin goes.</p>
          )}
          {editing && keepLocation && !location && (
            <p className="text-warning text-xs">
              Pick a spot, or switch this off — without one nothing is saved.
            </p>
          )}
        </>
      )}
      <Field
        label="Collection radius (m)"
        htmlFor="radius"
        error={errors.radius?.message}
        hint="How close fans must be to collect it."
      >
        <Input id="radius" type="number" min={1} {...register("radius", { valueAsNumber: true })} />
      </Field>
    </FormSection>
  );

  return (
    <FormProvider {...methods}>
      <FormPage
        title={editing ? "Edit template" : duplicating ? "Duplicate pin" : "New pin"}
        description={
          editing
            ? "Change what pins made from this template start with."
            : "A drop on the map that fans collect when they're nearby."
        }
        back={
          editing
            ? { href: "/pins/templates", label: "Templates" }
            : { href: "/pins", label: "Pins" }
        }
        onSubmit={(e) => {
          if (editing) {
            e.preventDefault();
            saveEditedTemplate();
          } else void onSubmit(e);
        }}
        actions={actions}
        aside={
          <>
            {locationSection}
            <Summary
              values={values}
              mode={collectionMode}
              token={selectedToken}
              remaining={remainingBalance}
              runsFor={editing ? describeMinutes(runMinutes) : undefined}
            />
          </>
        }
      >
        {editing ? (
          <FormSection title="Template" icon={LayoutTemplate}>
            <Field label="Template name" htmlFor="template-name" required>
              <Input
                id="template-name"
                maxLength={80}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </Field>
          </FormSection>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <TemplatePicker
              formType="PIN"
              onPick={(t) => {
                applyTemplate(t);
                toast.success(`Filled from “${t.name}”`);
              }}
            />
            {appliedName && (
              <span className="text-muted-foreground text-xs">
                From template <strong className="text-foreground">{appliedName}</strong>
              </span>
            )}
          </div>
        )}
        <AiFillCard
          form="pin"
          context={aiContext}
          examples={[
            "Coffee giveaway at our café this weekend, 50 free cups",
            "Hidden art pin in the park for a month",
            "Concert-night pin near the venue, auto collect",
          ]}
          apply={(r) => {
            const before = { ...values, mode: collectionMode };
            setValue("title", r.title, { shouldValidate: true });
            setValue("description", r.description);
            setValue("type", r.type);
            if (r.url) setValue("url", r.url);
            const start = fromLocal(r.startDate);
            const end = fromLocal(r.endDate);
            if (start) setValue("startDate", start, { shouldValidate: true });
            if (end) setValue("endDate", end, { shouldValidate: true });
            setValue("pinNumber", r.pinNumber);
            setValue("pinCollectionLimit", r.pinCollectionLimit);
            setValue("radius", r.radius);
            setValue("multiPin", r.multiPin);
            setCollectionMode(r.autoCollect ? "auto" : "manual");
            setTagIdeas(r.tags);
            setImageBrief(r.imagePrompt);
            return () => {
              (
                [
                  "title",
                  "description",
                  "type",
                  "url",
                  "startDate",
                  "endDate",
                  "pinNumber",
                  "pinCollectionLimit",
                  "radius",
                  "multiPin",
                ] as const
              ).forEach((k) => setValue(k, before[k] as never));
              setCollectionMode(before.mode);
              setTagIdeas([]);
            };
          }}
        />

        <FormSection title="How fans collect it" icon={Settings}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Collection mode">
            {(
              [
                ["manual", "Manual collect", "Fans tap to collect when they're in range."],
                ["auto", "Auto collect", "Collected automatically when fans enter the area."],
              ] as const
            ).map(([id, label, text]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={collectionMode === id}
                onClick={() => setCollectionMode(id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  collectionMode === id
                    ? "border-primary bg-primary/5"
                    : "hover:border-line-bright",
                )}
              >
                <span className="font-hud block text-sm font-semibold">{label}</span>
                <span className="text-muted-foreground mt-0.5 block text-xs">{text}</span>
              </button>
            ))}
          </div>
        </FormSection>

        <FormSection title="Details" icon={Sparkles}>
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
                context={aiContext}
                onChange={(t) => setValue("title", t, { shouldValidate: true })}
              />
            }
          >
            <Input id="title" placeholder="A catchy name fans will see" {...register("title")} />
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
                context={aiContext}
                onChange={(t) => setValue("description", t)}
              />
            }
          >
            <Textarea
              id="description"
              rows={4}
              className="resize-none"
              placeholder="What makes this drop worth walking to?"
              {...register("description")}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pin type">
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a type" />
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
              <Input id="url" type="url" placeholder="https://example.com" {...register("url")} />
            </Field>
          </div>
          <ImageUploadField
            value={values.image}
            onChange={(url) => setValue("image", url)}
            ai={{ form: "pin", suggestedPrompt: imagePrompt }}
          />
        </FormSection>

        <PinLookSection
          value={look}
          onChange={changeLook}
          autoCollect={collectionMode === "auto"}
          pinImage={values.image}
        />

        <FormSection
          title="Collection & tier"
          icon={Settings}
          description="Who can collect it, how many, and what they get."
        >
          <TiersOptions />
          <CollectionInputs
            setSelectedToken={setSelectedToken}
            setRemainingBalance={setRemainingBalance}
            assetsQuery={assetsQuery}
            selectedToken={selectedToken}
            remainingBalance={remainingBalance}
            showRadius={false}
          />
        </FormSection>

        {editing ? (
          <FormSection
            title="How long each pin runs"
            icon={Calendar}
            description="Counted from when a pin is dropped from this template."
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="Days" htmlFor="run-days">
                <Input
                  id="run-days"
                  type="number"
                  min={0}
                  max={1830}
                  value={runDays}
                  onChange={(e) => setRunDays(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                />
              </Field>
              <Field label="Hours" htmlFor="run-hours">
                <Input
                  id="run-hours"
                  type="number"
                  min={0}
                  max={23}
                  value={runHours}
                  onChange={(e) =>
                    setRunHours(Math.min(23, Math.max(0, Math.floor(Number(e.target.value) || 0))))
                  }
                />
              </Field>
            </div>
            <p className="text-muted-foreground text-xs">Runs for {describeMinutes(runMinutes)}.</p>
          </FormSection>
        ) : (
          <FormSection title="Schedule" icon={Calendar}>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["startDate", "endDate"] as const).map((name) => (
                <Field
                  key={name}
                  label={name === "startDate" ? "Starts" : "Ends"}
                  required
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
        )}

        <FormSection title="Tags & options" icon={Tag}>
          <TagsSection suggestions={tagIdeas} />
          <PinTypeToggles />
        </FormSection>

        {create.isError && <p className="text-destructive text-sm">{create.error.message}</p>}
      </FormPage>
      {!editing && (
        <SaveTemplateDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          formType="PIN"
          defaultName={values.title ?? ""}
          location={location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : null}
          build={(includeLocation) =>
            pinFormToTemplate(getValues() as PinFormLike, {
              mode: collectionMode,
              includeLocation,
              look,
            })
          }
        />
      )}
    </FormProvider>
  );
}

function Summary({
  values,
  mode,
  token,
  remaining,
  runsFor,
}: {
  values: Partial<CreatePinType>;
  mode: "manual" | "auto";
  token?: AssetType & { bal: number };
  remaining: number;
  /** Editing a template: its duration instead of dates. */
  runsFor?: string;
}) {
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
  return (
    <section className="bg-card border-foreground/10 rounded-[1.4rem] border-2 p-5">
      <h2 className="font-hud mb-3 text-base font-semibold">Summary</h2>
      {values.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={values.image}
          alt=""
          className="mb-3 aspect-video w-full rounded-lg object-cover"
        />
      )}
      <p className="font-hud text-sm font-semibold">
        {values.title?.trim() ? values.title : "Untitled pin"}
      </p>
      <div className="mt-2 divide-y">
        {row("Collection", mode === "auto" ? "Auto" : "Manual")}
        {row("Type", values.type ? typeLabel(values.type) : "—")}
        {row("Pins", values.pinNumber ?? 1)}
        {row("Limit per pin", values.pinCollectionLimit ?? 0)}
        {runsFor ? (
          row("Each pin runs", runsFor)
        ) : (
          <>
            {row("Starts", values.startDate ? values.startDate.toLocaleString() : "—")}
            {row("Ends", values.endDate ? values.endDate.toLocaleString() : "—")}
          </>
        )}
        {token &&
          row(
            "Token",
            `${token.code} · ${token.bal >= 1_000_000 ? "open edition" : `${token.bal} available`}`,
          )}
        {token &&
          row(
            "Left after",
            <span className={remaining < 0 ? "text-destructive" : undefined}>{remaining}</span>,
          )}
      </div>
    </section>
  );
}
