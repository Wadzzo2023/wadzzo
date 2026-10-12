import AsyncStorage from "@react-native-async-storage/async-storage";
import { createJSONStorage } from "zustand/middleware";

/** Persisted zustand stores live in AsyncStorage (non-secret UI state only). */
export const persistStorage = createJSONStorage(() => AsyncStorage);
