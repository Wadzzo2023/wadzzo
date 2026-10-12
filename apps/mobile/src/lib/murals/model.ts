import { loadTensorflowModel, type TensorflowModel } from "react-native-fast-tflite";

import { packModelPath } from "./pack";

/**
 * ── Mural model ────────────────────────────────────────────────────────────
 *
 * MobileCLIP S0 vision encoder, TFLite fp16 — converted from the exact ONNX
 * weights the web app and server use (cos ≥ 0.9998, identical lock
 * decisions on 73 test photos). The file itself is the Mural pack
 * (`pack.ts`): downloaded and integrity-checked in the background; this only
 * loads the verified copy.
 *
 * Input  [1, 256, 256, 3] float32, RGB 0–1, centre square crop.
 * Output [1, 512] float32 image embedding (normalise before use).
 */

export const MODEL_INPUT = 256;

let shared: Promise<TensorflowModel> | null = null;

/** One model per app session. Call only once the pack is ready and verified. */
export function loadMuralModel(): Promise<TensorflowModel> {
  if (shared) return shared;
  const path = packModelPath();
  if (!path) return Promise.reject(new Error("Mural pack not installed"));
  const loading = (async () => {
    // CoreML where it works (iOS), otherwise the CPU delegate.
    try {
      return await loadTensorflowModel({ url: path }, ["core-ml"]);
    } catch {
      return await loadTensorflowModel({ url: path }, []);
    }
  })().catch((e: unknown) => {
    shared = null;
    throw e;
  });
  shared = loading;
  return loading;
}
