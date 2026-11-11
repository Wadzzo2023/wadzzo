"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import {
  useSelectCreatorStore,
  type SelectedCreator,
} from "~/components/store/creator-selection-store";
import MapView from "~/features/pins/map-view";
import { CenteredSpinner } from "@wadzzo/ui/patterns/spinner";

import { api } from "~/utils/api";

import { BrandPicker } from "./brand-picker";

/**
 * Admin › All maps: pick a brand, then work on its map exactly as the brand does on its own
 * (the brand Map, acting for it): its pins, hotspots, trails and map layers; new pins and
 * hotspots open as floating cards and are made for the brand; trails are built for it; its
 * layers can be made, edited and picked. Templates stay the signed-in brand's own.
 * The chosen brand is kept in the URL (?brand=…) so links and Back keep it.
 */
export default function AdminMapsPage() {
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/maps";
  const search = useSearchParams();
  const { data: stored, setData: setStored } = useSelectCreatorStore();

  // ── Which brand: ?brand= → last picked → first brand ────────────────────
  const brands = api.fan.creator.getCreators.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const urlBrand = search?.get("brand");
  const brand =
    brands.data?.find((b) => b.id === urlBrand) ??
    (stored && brands.data?.find((b) => b.id === stored.id)) ??
    brands.data?.[0];

  const pickBrand = (b: SelectedCreator) => {
    setStored(b);
    router.replace(`${pathname}?brand=${encodeURIComponent(b.id)}`, { scroll: false });
  };
  useEffect(() => {
    if (brand && stored?.id !== brand.id) setStored(brand);
  }, [brand, stored?.id, setStored]);

  // One object per brand, so the map doesn't see a "new" brand on every render.
  const acting = useMemo(
    () => brand && { id: brand.id, name: brand.name, profileUrl: brand.profileUrl ?? null },
    [brand],
  );

  const picker = (
    <BrandPicker
      className="pointer-events-auto w-56 sm:w-64"
      brands={brands.data}
      value={brand}
      onChange={pickBrand}
      loading={brands.isPending}
    />
  );

  return (
    <div className="relative h-[calc(100dvh-4rem-4rem-var(--safe-bottom))] w-full overflow-hidden lg:h-dvh">
      {acting ? (
        // A fresh map per brand: its own pins, framing, layer and builder state.
        <MapView key={acting.id} brand={acting} toolbarStart={picker} />
      ) : brands.isPending ? (
        <CenteredSpinner />
      ) : (
        <div className="p-6">{picker}</div>
      )}
    </div>
  );
}
