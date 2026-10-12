import { Camera as ExpoCamera } from "expo-camera";
import * as Location from "expo-location";

/**
 * ── Camera permissions ─────────────────────────────────────────────────────
 *
 * One place that reads and asks for what each camera mode needs, shared by
 * the camera launcher (before a mode opens) and the AR screen's own gate
 * (for deep links straight into /ar).
 *
 * "motion" isn't a separate prompt: the compass heading rides on the
 * location grant, so it mirrors location.
 */

export type PermKey = "camera" | "location" | "motion";
export type PermState = "pending" | "granted" | "denied" | "unsupported";
export type PermStates = Partial<Record<PermKey, PermState>>;

export const PERMISSION_INFO: Record<PermKey, { title: string; why: string }> = {
  camera: { title: "Camera", why: "The live view drops are drawn over. Nothing is recorded or uploaded." },
  location: { title: "Location", why: "Works out which drops are within 75 m of you, and where to place them." },
  motion: { title: "Motion & compass", why: "Tells us which way you're facing so a pin stays put when you turn." },
};

type NativePerm = { granted: boolean; canAskAgain: boolean; status: string };

export function toPermState(p: NativePerm): PermState {
  if (p.granted) return "granted";
  return p.status === "denied" ? "denied" : "pending";
}

/** Denied and the OS won't show the prompt again: only Settings can fix it. */
const blocked = (p: NativePerm) => !p.granted && !p.canAskAgain;

export type PermCheck = { states: PermStates; ready: boolean; blocked: boolean };

function summarize(needs: PermKey[], cam: NativePerm | null, loc: NativePerm | null): PermCheck {
  const states: PermStates = {};
  if (needs.includes("camera") && cam) states.camera = toPermState(cam);
  if (needs.includes("location") && loc) states.location = toPermState(loc);
  if (needs.includes("motion") && loc) states.motion = toPermState(loc);
  return {
    states,
    ready: needs.every((k) => states[k] === "granted"),
    blocked: Boolean((cam && needs.includes("camera") && blocked(cam)) || (loc && needs.includes("location") && blocked(loc))),
  };
}

/** Current state, without prompting. */
export async function checkPermissions(needs: PermKey[]): Promise<PermCheck> {
  const [cam, loc] = await Promise.all([
    needs.includes("camera") ? ExpoCamera.getCameraPermissionsAsync() : null,
    needs.includes("location") || needs.includes("motion") ? Location.getForegroundPermissionsAsync() : null,
  ]);
  return summarize(needs, cam, loc);
}

/** Prompt for anything not yet granted (camera first, then location). */
export async function requestPermissions(needs: PermKey[]): Promise<PermCheck> {
  const cam = needs.includes("camera") ? await ExpoCamera.requestCameraPermissionsAsync() : null;
  const loc = needs.includes("location") || needs.includes("motion") ? await Location.requestForegroundPermissionsAsync() : null;
  return summarize(needs, cam, loc);
}
