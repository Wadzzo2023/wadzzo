import type { CameraPerm } from "~/components/camera/modes";

/**
 * Read-only permission check for the camera launcher (never prompts).
 *
 * The browser can't be asked for permission from the launcher itself: iOS
 * Safari only honours the compass request inside a tap on the page that uses
 * it, which is why /ar asks for all three from its own gate. So the launcher
 * only *shows* what's already allowed; the AR / QR pages do the asking.
 *
 * `navigator.permissions` isn't everywhere (older Safari has no "camera"
 * name), so each answer may be null = unknown, and then no verdict is shown.
 */
export type PermAnswer = "granted" | "denied" | "prompt" | null;
export type PermAnswers = Partial<Record<CameraPerm, PermAnswer>>;

const NAMES: Record<CameraPerm, string> = {
  camera: "camera",
  location: "geolocation",
};

async function query(perm: CameraPerm): Promise<PermAnswer> {
  try {
    if (!navigator?.permissions?.query) return null;
    const res = await navigator.permissions.query({
      name: NAMES[perm] as PermissionName,
    });
    return res.state;
  } catch {
    return null;
  }
}

export async function readCameraPermissions(): Promise<PermAnswers> {
  const [camera, location] = await Promise.all([
    query("camera"),
    query("location"),
  ]);
  return { camera, location };
}
