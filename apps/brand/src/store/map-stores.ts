import { create } from "zustand";
import type { Location, LocationGroup, PinType } from "@wadzzo/db";

/** Visible map area (same fields Google used, so the store logic is unchanged). */
export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};
export type LatLng = { lat: number; lng: number };

/// Define Pin type for clarity and consistency with Prisma schema
export type Pin = {
  locationGroup:
    | (LocationGroup & {
        creator: {
          profileUrl: string | null;
          name?: string;
          coverUrl?: string | null;
        };
        /** The brand's own pin shape, when the drop uses one. */
        pinShape?: { path: string; anchor: string } | null;
      })
    | null;
  _count: {
    consumers: number;
  };
} & Location;

/**
 * A pin as the map lists and draws it: only what that needs (see MAP_PIN_SELECT in the API).
 * The details window works with the full `Pin`, fetched when a pin is opened.
 */
export type PinOnMap = Pick<
  Location,
  "id" | "latitude" | "longitude" | "autoCollect" | "hidden"
> & {
  _count: { consumers: number };
  locationGroup:
    | (Pick<
        LocationGroup,
        | "id"
        | "title"
        | "image"
        | "optimizedImage"
        | "type"
        | "startDate"
        | "endDate"
        | "limit"
        | "remaining"
        | "approved"
        | "hotspotId"
        | "markerShape"
        | "pinShapeId"
        | "markerFill"
        | "markerColor"
        | "markerImageFit"
        | "markerAutoBadge"
      > & {
        creator: { profileUrl: string | null };
        pinShape: { path: string; anchor: string } | null;
      })
    | null;
};

// Re-defining ModalData here as use-modal-store.ts is being removed
export type ModalData = {
  long: number;
  lat: number;
  pinId: string;
  mapTitle: string;
  image: string;
  mapDescription: string;
  endDate: Date;
  startDate: Date;
  pinCollectionLimit: number;
  pinRemainingLimit: number;
  multiPin: boolean;
  subscriptionId: string;
  autoCollect: boolean;
  pageAsset: boolean;
  privacy: string;
  pinNumber: number;
  link: string;
  assetId: number;
  type?: PinType; // Added type to ModalData
};

interface NearbyPinsState {
  nearbyPins: PinOnMap[];
  // Separate pin states for different contexts
  myPins: PinOnMap[]; // Creator's own pins
  adminPins: PinOnMap[]; // Admin-selected creator's pins
  allPins: PinOnMap[]; // Legacy - for nearby panel filtering

  setMyPins: (pins: PinOnMap[]) => void;
  setAdminPins: (pins: PinOnMap[]) => void;
  setAllPins: (pins: PinOnMap[]) => void;
  setNearbyPins: (pins: PinOnMap[]) => void;
  filterNearbyPins: (center: MapBounds, source?: "my" | "admin") => void;
  clearAdminPins: () => void;
}

export const useNearbyPinsStore = create<NearbyPinsState>((set, get) => ({
  nearbyPins: [],
  myPins: [],
  adminPins: [],
  allPins: [], // Keep for backward compatibility

  setNearbyPins: (pins: PinOnMap[]) => set({ nearbyPins: pins }),

  setMyPins: (pins: PinOnMap[]) => {
    const currentPins = get().myPins;
    if (
      pins.length !== currentPins.length ||
      pins.map((pin) => pin.id).join(",") !== currentPins.map((pin) => pin.id).join(",")
    ) {
      set({ myPins: pins, allPins: pins });
    }
  },

  setAdminPins: (pins: PinOnMap[]) => {
    const currentPins = get().adminPins;
    if (
      pins.length !== currentPins.length ||
      pins.map((pin) => pin.id).join(",") !== currentPins.map((pin) => pin.id).join(",")
    ) {
      set({ adminPins: pins, allPins: pins });
    }
  },

  setAllPins: (pins: PinOnMap[]) => {
    const currentPins = get().allPins;
    if (
      pins.length !== currentPins.length ||
      pins.map((pin) => pin.id).join(",") !== currentPins.map((pin) => pin.id).join(",")
    ) {
      set({ allPins: pins });
    }
  },

  filterNearbyPins: (center: MapBounds, source?: "my" | "admin") => {
    const { myPins, adminPins, allPins, nearbyPins } = get();
    // Use the appropriate source pins for filtering
    const sourcePins = source === "my" ? myPins : source === "admin" ? adminPins : allPins;
    const filtered = sourcePins.filter(
      (pin) =>
        pin.latitude >= center.south &&
        pin.latitude <= center.north &&
        pin.longitude >= center.west &&
        pin.longitude <= center.east,
    );
    if (
      filtered.length !== nearbyPins.length ||
      filtered.map((pin) => pin.id).join(",") !== nearbyPins.map((pin) => pin.id).join(",")
    ) {
      set({ nearbyPins: filtered });
    }
  },

  clearAdminPins: () => set({ adminPins: [], nearbyPins: [] }),
}));

export type IPin = {
  title?: string;
  lat: number;
  lng: number;
  description?: string | undefined;
  startDate?: Date;
  endDate?: Date;
  autoCollect: boolean;
  pinCollectionLimit?: number;
  tier: number | undefined | null;
  url?: string | undefined | null;
  image?: string | undefined | null;
  token?: number;
  type?: PinType;
  multiPin?: boolean;
  pinNumber?: number;
  radius?: number;
};

interface IMapInteractionStore {
  // Create Pin Modal State
  isOpenCreatePin: boolean;
  openCreatePinModal: () => void;
  closeCreatePinModal: () => void;
  manual: boolean;
  setManual: (value: boolean) => void;
  position: LatLng | undefined;
  setPosition: (pos: LatLng | undefined) => void;
  prevData?: IPin;
  setPrevData: (value?: IPin) => void;
  duplicate: boolean;
  setDuplicate: (value: boolean) => void;

  // Pin Detail Modal State
  selectedPinForDetail: Pin | null;
  openPinDetailModal: (pin: Pin) => void;
  closePinDetailModal: () => void;

  // Pin Copy/Cut State (moved from useModal)
  isPinCopied: boolean;
  isPinCut: boolean;
  setPinCopied: (value: boolean, pin?: Pin) => void; // Add optional pin parameter
  setPinCut: (value: boolean, pin?: Pin) => void; // Add optional pin parameter
  setIsAutoCollect: (value: boolean) => void; // This was on useModal, but seems map-specific
  copiedPinData: Pin | null; // Renamed from modalData to be more specific
}

export const useMapInteractionStore = create<IMapInteractionStore>((set) => ({
  // Create Pin Modal
  isOpenCreatePin: false,
  openCreatePinModal: () => set({ isOpenCreatePin: true }),
  closeCreatePinModal: () =>
    set({
      isOpenCreatePin: false,
      prevData: undefined,
      manual: false,
      duplicate: false,
    }),
  manual: false,
  setManual: (value) => set({ manual: value }),
  position: undefined,
  setPosition: (pos) => set({ position: pos }),
  prevData: undefined,
  setPrevData: (value) => set({ prevData: value }),
  duplicate: false,
  setDuplicate: (value) => set({ duplicate: value }),

  // Pin Detail Modal
  selectedPinForDetail: null,
  openPinDetailModal: (pin) => set({ selectedPinForDetail: pin }),
  closePinDetailModal: () =>
    set((state) => ({
      selectedPinForDetail: state.isPinCut || state.isPinCopied ? state.selectedPinForDetail : null,
    })),
  // Pin Copy/Cut State
  isPinCopied: false,
  isPinCut: false,
  setPinCopied: (value, pin) => set({ isPinCopied: value, copiedPinData: value ? pin : null }),
  setPinCut: (value, pin) => set({ isPinCut: value, copiedPinData: value ? pin : null }),
  setIsAutoCollect: (value) =>
    set((state) => ({
      copiedPinData: state.copiedPinData ? { ...state.copiedPinData, autoCollect: value } : null,
    })),
  copiedPinData: null, // Initialize copiedPinData
}));

/** Where the camera was on a map, so coming back to it doesn't start over. */
export type SavedMapView = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
};

/** A place picked from the map's search box. */
export type SearchedPlace = LatLng & { name: string; address?: string };

interface PinsMapViewState {
  /** The /pins map's camera, null until the brand has looked around. */
  view: SavedMapView | null;
  /** The place last picked in the search box, marked on the map until cleared. */
  place: SearchedPlace | null;
  setView: (view: SavedMapView) => void;
  setPlace: (place: SearchedPlace | null) => void;
}

/**
 * Lives for the browser session (module state), so going to /pins/new and
 * back lands on the same view with the searched place still marked.
 */
export const usePinsMapViewStore = create<PinsMapViewState>((set) => ({
  view: null,
  place: null,
  setView: (view) => set({ view }),
  setPlace: (place) => set({ place }),
}));
