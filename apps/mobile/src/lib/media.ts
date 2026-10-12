import * as ImagePicker from "expo-image-picker";

import type { LocalFile } from "~/lib/api/upload";

function toLocal(a: ImagePicker.ImagePickerAsset): LocalFile {
  const ext = a.uri.split(".").pop()?.toLowerCase() ?? "jpg";
  const type =
    a.mimeType ??
    (a.type === "video" ? (ext === "mov" ? "video/quicktime" : "video/mp4") : ext === "png" ? "image/png" : ext === "heic" ? "image/heic" : "image/jpeg");
  return { uri: a.uri, name: a.fileName ?? `upload.${ext}`, type, size: a.fileSize ?? 0 };
}

/** Pick from the library. `null` when cancelled or permission refused. */
export async function pickFromLibrary(opts: { images?: boolean; videos?: boolean; multiple?: boolean; square?: boolean; limit?: number } = {}) {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: [...(opts.images !== false ? (["images"] as const) : []), ...(opts.videos ? (["videos"] as const) : [])],
    allowsEditing: Boolean(opts.square) && !opts.multiple,
    aspect: opts.square ? [1, 1] : undefined,
    allowsMultipleSelection: Boolean(opts.multiple),
    selectionLimit: opts.limit ?? 0,
    quality: 0.85,
  });
  if (res.canceled) return null;
  return res.assets.map(toLocal);
}

/** Capture with the camera (approved native addition for bounty entries). */
export async function captureWithCamera(opts: { video?: boolean } = {}) {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: opts.video ? ["images", "videos"] : ["images"],
    quality: 0.85,
  });
  if (res.canceled) return null;
  return res.assets.map(toLocal);
}
