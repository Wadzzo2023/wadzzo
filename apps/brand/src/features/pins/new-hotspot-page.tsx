"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PinType } from "@wadzzo/db";
import {
  CalendarClock,
  Hexagon,
  LayoutTemplate,
  Loader2,
  PencilLine,
  Save,
  Settings,
  Sparkles,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import type { z } from "zod";

import { featureCenter, type DrawShape, type StoredFeature } from "@wadzzo/geo/map-geometry";
import { Switch } from "@wadzzo/ui/components/switch";
import { Label } from "@wadzzo/ui/components/label";
import {
  CollectionInputs,
  ImageUploadField,
  PinTypeToggles,
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
import { cn } from "@wadzzo/ui/lib/cn";
import { useHotspotDraft } from "~/store/hotspot-draft";
import { createHotspotFormSchema } from "@wadzzo/schemas/hotspot";
import { EmptyState } from "@wadzzo/ui/poster/empty-state";
import { CenteredSpinner } from "@wadzzo/ui/patterns/spinner";
import { AiFillCard } from "~/ui/ai/ai-fill";
import { AiTextButton } from "~/ui/ai/ai-text";
import { fromLocal } from "~/ui/ai/shared";
import { Field, FormPage, FormSection } from "~/ui/form-page";

import { AreaPreview, AreaSize, DROP_EVERY, LIFETIME, toInput } from "./hotspot-parts";
import { toastFormErrors } from "~/utils/form-errors";
import { api } from "~/utils/api";

import {
  loadLastLook,
  PinLookSection,
  saveLastLook,
  toLookValue,
  type PinLookValue,
} from "./look/pin-look-section";
import { AreaDrawDialog } from "./templates/area-draw-dialog";
import {
  hotspotFormToTemplate,
  templateArea,
  templateToHotspotForm,
  type HotspotFormLike,
} from "./templates/mapping";
import { SaveTemplateDialog } from "./templates/save-template-dialog";
import {
  TemplatePicker,
  type HotspotTemplateRow,
  type TemplateRow,
} from "./templates/template-picker";

type HotspotForm = z.infer<typeof createHotspotFormSchema>;

const typeLabel = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

/**
 * Pins › New hotspot. The area drawn on the map, then one page: how fans
 * collect, the drop schedule, what each pin is, and the collection rules.
 */
/** Nothing to subscribe to: only used to tell the server render from the client one. */
const noSubscribe = () => () => undefined;

/**
 * `?template=<id>` opens with that template applied. The area comes from the
 * map (just drawn, or a template's area placed there); without one, the
 * template's own area is used, and with neither the brand is sent to draw it.
 * With `editTemplate` the same form edits a saved hotspot template.
 */
export default function NewHotspotPage({
  editTemplate,
}: { editTemplate?: HotspotTemplateRow } = {}) {
  const { feature, shape, set: setDraft } = useHotspotDraft();
  const search = useSearchParams();
  const templateId = editTemplate ? null : (search?.get("template") ?? null);
  const linked = api.maps.template.get.useQuery(
    { id: templateId ?? "" },
    { enabled: Boolean(templateId), retry: false },
  );
  // The draft lives in sessionStorage: wait for the client before deciding.
  const ready = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

  // No area drawn yet but the template has one: use it.
  const linkedArea = linked.data?.formType === "HOTSPOT" ? templateArea(linked.data.data) : null;
  const usingLinkedArea = ready && !feature && Boolean(linkedArea);
  useEffect(() => {
    if (usingLinkedArea && linkedArea) setDraft(linkedArea.feature, linkedArea.shape);
  }, [usingLinkedArea, linkedArea, setDraft]);

  if (!ready || usingLinkedArea) return <CenteredSpinner />;
  if (editTemplate) {
    const area = templateArea(editTemplate.data);
    return (
      <HotspotForm
        feature={area?.feature ?? null}
        shape={area?.shape ?? "polygon"}
        editTemplate={editTemplate}
      />
    );
  }
  if (templateId && linked.isLoading) return <CenteredSpinner />;
  const linkedTemplate = linked.data?.formType === "HOTSPOT" ? linked.data : undefined;
  if (!feature)
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <EmptyState
          icon={Hexagon}
          title="Draw the area first"
          description="On the Pins map, choose Draw hotspot and outline where pins should drop."
          action={
            <Button asChild>
              <Link href={templateId ? `/pins?draw=1&template=${templateId}` : "/pins?draw=1"}>
                Draw on the map
              </Link>
            </Button>
          }
        />
      </div>
    );
  return <HotspotForm feature={feature} shape={shape} linkedTemplate={linkedTemplate} />;
}

const DAY_MS = 86_400_000;

function HotspotForm({
  feature: initialFeature,
  shape: initialShape,
  linkedTemplate,
  editTemplate,
}: {
  /** The area to drop in (required to create; optional on a template). */
  feature: StoredFeature | null;
  shape: HotspotForm["hotspotShape"];
  linkedTemplate?: HotspotTemplateRow;
  editTemplate?: HotspotTemplateRow;
}) {
  const router = useRouter();
  const editing = Boolean(editTemplate);
  const [area, setArea] = useState<{ feature: StoredFeature; shape: DrawShape } | null>(
    initialFeature ? { feature: initialFeature, shape: initialShape } : null,
  );
  const feature = area?.feature ?? null;
  const shape = area?.shape ?? initialShape;
  const [drawOpen, setDrawOpen] = useState(false);
  const setDraft = useHotspotDraft((st) => st.set);
  const today = useMemo(() => new Date(), []);
  const inOneYear = useMemo(
    () =>
      new Date(
        today.getFullYear() + 1,
        today.getMonth(),
        today.getDate(),
        today.getHours(),
        today.getMinutes(),
      ),
    [today],
  );

  const methods = useForm<z.input<typeof createHotspotFormSchema>, unknown, HotspotForm>({
    resolver: zodResolver(createHotspotFormSchema),
    defaultValues: {
      title: "",
      description: "",
      pinNumber: 1,
      pinCollectionLimit: 0,
      autoCollect: false,
      multiPin: false,
      type: PinType.OTHER,
      hotspotShape: initialShape,
      dropEveryDays: 1,
      pinDurationDays: 3,
      hotspotStartDate: today,
      hotspotEndDate: inOneYear,
      url: "",
    },
  });
  const { register, handleSubmit, setValue, watch, control, setError, formState } = methods;
  const { errors } = formState;
  const values = watch();

  const [collectionMode, setCollectionMode] = useState<"manual" | "auto">("manual");
  const [look, setLook] = useState<PinLookValue>(() =>
    toLookValue(editTemplate?.data.look ?? null),
  );
  // A new hotspot starts from the brand's last look (browser storage, so after mount).
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
  const [applied, setApplied] = useState<HotspotTemplateRow | null>(null);
  const [templateName, setTemplateName] = useState(editTemplate?.name ?? "");
  const [keepArea, setKeepArea] = useState(editTemplate?.hasLocation ?? false);
  const [runDays, setRunDays] = useState(editTemplate?.data.scheduleDays ?? 365);

  /** Fill the form from a template; the area already drawn stays. */
  const applyTemplate = (t: TemplateRow) => {
    if (t.formType !== "HOTSPOT") return;
    const { values: v, mode, look: tLook } = templateToHotspotForm(t.data, new Date());
    if (tLook) {
      lookTouched.current = true;
      setLook(toLookValue(tLook));
    }
    (Object.entries(v) as [keyof HotspotForm, never][]).forEach(([k, val]) =>
      setValue(k, val, { shouldValidate: false }),
    );
    // fields the template leaves out go back to their defaults
    if (!v.hotspotStartDate) {
      setValue("hotspotStartDate", new Date());
      setValue("hotspotEndDate", new Date(Date.now() + 365 * DAY_MS));
    }
    setCollectionMode(mode);
    setApplied(t);
  };
  const appliedFor = useRef<string | null>(null);
  useEffect(() => {
    const t = editTemplate ?? linkedTemplate;
    if (!t || appliedFor.current === t.id) return;
    appliedFor.current = t.id;
    applyTemplate(t);
    // apply once per template
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTemplate, linkedTemplate]);
  const appliedArea = applied ? templateArea(applied.data) : null;

  const changeArea = (f: StoredFeature, sh: DrawShape) => {
    setArea({ feature: f, shape: sh });
    setValue("hotspotShape", sh);
    if (!editing) setDraft(f, sh);
  };

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
      data: hotspotFormToTemplate(methods.getValues() as HotspotFormLike, {
        mode: collectionMode,
        area: keepArea ? area : null,
        look,
        scheduleDays: Math.max(1, Math.min(3650, Math.floor(runDays) || 1)),
      }),
    });
  };
  const [imageBrief, setImageBrief] = useState("");
  const aiContext = {
    title: values.title ?? "",
    description: values.description ?? "",
    area: feature
      ? `${shape} hotspot near ${featureCenter(feature).lat.toFixed(4)}, ${featureCenter(feature).lng.toFixed(4)}`
      : "",
  };
  const imagePrompt =
    imageBrief || [values.title, values.description?.slice(0, 400)].filter(Boolean).join(". ");
  const DAY_OPTIONS = [1, 2, 3, 5, 7, 14, 30];
  const nearestDays = (n: number) =>
    DAY_OPTIONS.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
  const [selectedToken, setSelectedToken] = useState<(AssetType & { bal: number }) | undefined>();
  const [remainingBalance, setRemainingBalance] = useState(0);
  const assetsQuery = api.fan.asset.myAssets.useQuery();

  useEffect(() => {
    setRemainingBalance(selectedToken ? selectedToken.bal - (values.pinCollectionLimit ?? 0) : 0);
  }, [values.pinCollectionLimit, selectedToken]);

  const clearDraft = useHotspotDraft((st) => st.clear);
  const create = api.maps.pin.createHotspot.useMutation({
    onSuccess: () => {
      clearDraft();
      saveLastLook(look);
      toast.success("Hotspot created — the first pins drop on schedule");
      router.push("/pins");
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = handleSubmit((data) => {
    if (!feature) {
      toast.error("Draw the area first");
      setDrawOpen(true);
      return;
    }
    if (data.hotspotEndDate <= data.hotspotStartDate) {
      setError("hotspotEndDate", { message: "Must be after the start" });
      toast.error("Must be after the start");
      return;
    }
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
      url: data.url ?? "",
      hotspotShape: shape,
      geoJson: feature,
    });
  }, toastFormErrors);

  const drops = (() => {
    const s = values.hotspotStartDate?.getTime();
    const e = values.hotspotEndDate?.getTime();
    if (!s || !e || e < s) return null;
    return Math.floor((e - s) / 86_400_000 / (values.dropEveryDays || 1)) + 1;
  })();

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
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          clearDraft();
          router.push("/pins");
        }}
      >
        Cancel
      </Button>
      <Button type="button" variant="outline" onClick={() => setSaveOpen(true)}>
        <LayoutTemplate /> <span className="hidden sm:inline">Save as template</span>
        <span className="sm:hidden">Template</span>
      </Button>
      <Button type="submit" disabled={create.isPending || remainingBalance < 0}>
        {create.isPending && <Loader2 className="animate-spin" />}
        {create.isPending ? "Creating…" : "Create hotspot"}
      </Button>
    </>
  );

  return (
    // CollectionInputs / TiersOptions / PinTypeToggles share field names with the pin form.
    <FormProvider {...(methods as unknown as ReturnType<typeof useForm<CreatePinType>>)}>
      <FormPage
        title={editing ? "Edit hotspot template" : "New hotspot"}
        description={
          editing
            ? "Change what hotspots made from this template start with."
            : "An area that keeps dropping pins on a schedule. Each drop lands somewhere inside it."
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
            <FormSection
              title="Area"
              icon={Hexagon}
              description={
                feature && (!editing || keepArea) ? (
                  <AreaSize feature={feature} shape={shape} />
                ) : editing ? (
                  "Optional — keep an area with the template, or draw one each time it's used."
                ) : undefined
              }
            >
              {editing && (
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <Label htmlFor="keep-area" className="text-sm font-medium">
                    Save an area with this template
                  </Label>
                  <Switch id="keep-area" checked={keepArea} onCheckedChange={setKeepArea} />
                </div>
              )}
              {(!editing || keepArea) && (
                <>
                  {feature && (
                    <AreaPreview
                      key={JSON.stringify(feature.geometry.coordinates[0]?.[0])}
                      feature={feature}
                    />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setDrawOpen(true)}
                  >
                    <PencilLine /> {feature ? "Redraw the area" : "Draw the area"}
                  </Button>
                  {!editing && appliedArea && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => changeArea(appliedArea.feature, appliedArea.shape)}
                    >
                      Use the template&apos;s saved area instead
                    </Button>
                  )}
                </>
              )}
            </FormSection>
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
              <p className="font-hud text-sm font-semibold">{values.title || "Untitled hotspot"}</p>
              <div className="mt-2 divide-y text-sm">
                {(
                  [
                    ["Collection", collectionMode === "auto" ? "Auto" : "Manual"],
                    ["First drop", values.hotspotStartDate?.toLocaleString() ?? "—"],
                    [
                      "Frequency",
                      DROP_EVERY.find(([d]) => d === values.dropEveryDays)?.[1] ??
                        `Every ${values.dropEveryDays} days`,
                    ],
                    [
                      "Each pin lasts",
                      LIFETIME.find(([d]) => d === values.pinDurationDays)?.[1] ??
                        `${values.pinDurationDays} days`,
                    ],
                    ["Pins per drop", values.pinNumber ?? 1],
                    ["Est. drops", drops ?? "—"],
                    ...(selectedToken
                      ? ([
                          [
                            "Token",
                            `${selectedToken.code} · ${selectedToken.bal >= 1_000_000 ? "open edition" : `${selectedToken.bal} available`}`,
                          ],
                        ] as const)
                      : []),
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 py-1.5">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="text-right font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </section>
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
              formType="HOTSPOT"
              onPick={(t) => {
                applyTemplate(t);
                toast.success(`Filled from “${t.name}”`);
              }}
            />
            {applied && (
              <span className="text-muted-foreground text-xs">
                From template <strong className="text-foreground">{applied.name}</strong>
              </span>
            )}
          </div>
        )}
        <AiFillCard
          form="hotspot"
          context={aiContext}
          examples={[
            "Daily coffee coupons around our 3 cafés for a month",
            "Weekly art drops in the park all summer",
            "Festival weekend: new pins every day, auto collect",
          ]}
          apply={(r) => {
            const before = { ...values, mode: collectionMode };
            setValue("title", r.title, { shouldValidate: true });
            setValue("description", r.description);
            setValue("type", r.type);
            if (r.url) setValue("url", r.url);
            const start = fromLocal(r.hotspotStartDate);
            const end = fromLocal(r.hotspotEndDate);
            if (start) setValue("hotspotStartDate", start, { shouldValidate: true });
            if (end) setValue("hotspotEndDate", end, { shouldValidate: true });
            setValue("dropEveryDays", nearestDays(r.dropEveryDays));
            setValue("pinDurationDays", nearestDays(r.pinDurationDays));
            setValue("pinNumber", r.pinNumber);
            setValue("pinCollectionLimit", r.pinCollectionLimit);
            setValue("multiPin", r.multiPin);
            setCollectionMode(r.autoCollect ? "auto" : "manual");
            setImageBrief(r.imagePrompt);
            return () => {
              (
                [
                  "title",
                  "description",
                  "type",
                  "url",
                  "hotspotStartDate",
                  "hotspotEndDate",
                  "dropEveryDays",
                  "pinDurationDays",
                  "pinNumber",
                  "pinCollectionLimit",
                  "multiPin",
                ] as const
              ).forEach((k) => setValue(k, before[k] as never));
              setCollectionMode(before.mode);
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

        <FormSection
          title="Drop schedule"
          icon={CalendarClock}
          description="When the hotspot runs and how often it drops a new pin."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {editing && (
              <Field
                label="Keeps dropping for (days)"
                htmlFor="run-days"
                hint="Counted from when a hotspot is made from this template."
              >
                <Input
                  id="run-days"
                  type="number"
                  min={1}
                  max={3650}
                  value={runDays}
                  onChange={(e) => setRunDays(Math.floor(Number(e.target.value) || 0))}
                />
              </Field>
            )}
            {!editing &&
              (["hotspotStartDate", "hotspotEndDate"] as const).map((name) => (
                <Field
                  key={name}
                  label={name === "hotspotStartDate" ? "Starts" : "Ends"}
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
            <Field label="Drop a new pin" error={errors.dropEveryDays?.message}>
              <Controller
                name="dropEveryDays"
                control={control}
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DROP_EVERY.map(([d, l]) => (
                        <SelectItem key={d} value={String(d)}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Each pin stays for" error={errors.pinDurationDays?.message}>
              <Controller
                name="pinDurationDays"
                control={control}
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LIFETIME.map(([d, l]) => (
                        <SelectItem key={d} value={String(d)}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Pin details"
          icon={Sparkles}
          description="What every dropped pin looks like."
        >
          <Field
            label="Title"
            htmlFor="title"
            required
            error={errors.title?.message}
            action={
              <AiTextButton
                form="hotspot"
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
                form="hotspot"
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
              placeholder="Why should fans come here?"
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
              <Input id="url" type="url" placeholder="https://example.com" {...register("url")} />
            </Field>
          </div>
          <ImageUploadField
            value={values.image}
            onChange={(url) => setValue("image", url)}
            ai={{ form: "hotspot", suggestedPrompt: imagePrompt }}
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
          icon={Tag}
          description="Who can collect, how many, and what they get."
        >
          <TiersOptions />
          <CollectionInputs
            setSelectedToken={setSelectedToken}
            setRemainingBalance={setRemainingBalance}
            assetsQuery={assetsQuery}
            selectedToken={selectedToken}
            remainingBalance={remainingBalance}
          />
          <PinTypeToggles />
        </FormSection>

        {create.isError && <p className="text-destructive text-sm">{create.error.message}</p>}
      </FormPage>
      <AreaDrawDialog
        open={drawOpen}
        onOpenChange={setDrawOpen}
        current={area}
        onDone={changeArea}
      />
      {!editing && (
        <SaveTemplateDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          formType="HOTSPOT"
          defaultName={values.title ?? ""}
          location={
            feature
              ? `${shape} area near ${featureCenter(feature).lat.toFixed(4)}, ${featureCenter(feature).lng.toFixed(4)}`
              : null
          }
          build={(includeArea) =>
            hotspotFormToTemplate(methods.getValues() as HotspotFormLike, {
              mode: collectionMode,
              area: includeArea ? area : null,
              look,
            })
          }
        />
      )}
    </FormProvider>
  );
}
