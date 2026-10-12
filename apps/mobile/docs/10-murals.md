# 10 · Murals

Plan lives in `wadzzoAR/docs/murals/plan.md` (§6 camera, §7 map, §8 collection, §10 mobile).

Built here:
- `src/app/murals/index.tsx` — camera. VisionCamera 5 frame output → worklet → `react-native-fast-tflite` (MobileCLIP S0 TFLite fp16, downloaded on first use; `src/lib/murals/model.ts`). Sweep on the gyroscope (`useMuralSweep`), first turn = "left".
- `src/app/murals/[id].tsx`, `src/app/coins.tsx`, Collection › Murals tab, map murals layer (`MuralMarker`, `MuralSheet`).
- API: `src/lib/murals/api.ts` → wadzzoAR `/api/mobile/v1/murals*`, `/me/murals`, `/me/coins*`.

Native deps (need a dev-client build, not Expo Go): react-native-vision-camera 5.2.3, react-native-vision-camera-worklets, react-native-nitro-modules, react-native-nitro-image, react-native-fast-tflite (config plugin with CoreML). iOS prebuild + unsigned device build verified 2026-10-04; Android not yet built.
