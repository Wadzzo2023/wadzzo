import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Ships as an update to the existing Wadzzo store listing
 * (`com.thebillboardapp.wadzzo`), so the version must stay above the old
 * app's 4.8.2. Build numbers are managed remotely by EAS (see eas.json).
 *
 * The URL scheme is kept from the old app too: it's what Albedo and OAuth
 * redirect back to, and existing deep links already use it.
 */
const SCHEME = "com.thebillboardapp.wadzzo";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {
    // .env may not exist in EAS/CI environment
  }
}

/** Google's iOS URL scheme is the iOS client ID, reversed. */
function reversedClientId(clientId: string | undefined) {
  const id =
    clientId ||
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    "443284916220-0o3tqbeeksf9thva9idge4psar2dmi58.apps.googleusercontent.com";
  return `com.googleusercontent.apps.${id.replace(".apps.googleusercontent.com", "")}`;
}

const CAMERA =
  "Wadzzo uses your camera to show drops around you in augmented reality and to scan Wadzzo QR codes.";
const LOCATION =
  "Wadzzo uses your location to show drops near you and to check you're close enough to collect one.";
const PHOTOS =
  "Wadzzo uses your photos so you can attach them to bounty entries and set your profile picture.";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Wadzzo",
  slug: "Wadzzo",
  version: "6.0.1",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: SCHEME,
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "com.thebillboardapp.wadzzo",
    // The App Store listing (the old app, v4.x) supported iPad, and an update
    // may never drop a device family ("does not support one or more of the
    // devices supported by the previous app version"). Portrait-only on iPad
    // needs requireFullScreen, or validation demands all four orientations.
    supportsTablet: true,
    requireFullScreen: true,
    usesAppleSignIn: true,
    infoPlist: {
      NSCameraUsageDescription: CAMERA,
      NSLocationWhenInUseUsageDescription: LOCATION,
      NSPhotoLibraryUsageDescription: PHOTOS,
      NSMotionUsageDescription:
        "Wadzzo uses motion sensors to tilt the foil on your cards and to point the AR view the way you're facing.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.thebillboardapp.wadzzo",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0A120E",
    },
    permissions: [
      "android.permission.CAMERA",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
    ],
    blockedPermissions: ["android.permission.ACCESS_BACKGROUND_LOCATION"],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-router",
    "expo-dev-client",
    "expo-asset",
    "expo-font",
    "expo-image",
    "expo-secure-store",
    "expo-audio",
    "expo-web-browser",
    "expo-sharing",
    "expo-status-bar",
    "expo-apple-authentication",
    // iOS 27 kills apps at launch unless they adopt the UIScene lifecycle
    // (crash in _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption).
    // SDK 57 opts in here; SDK 58+ does it in the template — remove on upgrade.
    ["expo-build-properties", { ios: { enableSceneSupport: true } }],
    [
      "expo-splash-screen",
      {
        // The W in an AR viewfinder on a radar: sonar rings, compass bezel,
        // one drop per rarity. Generated from assets/icon.png — circular so
        // Android 12+'s round splash-icon mask never clips it.
        image: "./assets/brand/splash-light.png",
        imageWidth: 280,
        resizeMode: "contain",
        // Background = the boot sequence's first frame, so the hand-over has
        // no colour flash.
        backgroundColor: "#F4F8F5",
        dark: { image: "./assets/brand/splash-dark.png", backgroundColor: "#0A120E" },
      },
    ],
    // Foreground only (decided): "while using" permission, no background.
    [
      "expo-location",
      { locationWhenInUsePermission: LOCATION, isIosBackgroundLocationEnabled: false },
    ],
    [
      "expo-camera",
      { cameraPermission: CAMERA, recordAudioAndroid: false, microphonePermission: false },
    ],
    [
      "expo-image-picker",
      { photosPermission: PHOTOS, cameraPermission: CAMERA, microphonePermission: false },
    ],
    [
      "@reactvision/react-viro",
      {
        // No cloud or geospatial anchors: pins are placed from GPS ourselves.
        provider: "none",
        ios: {
          cameraUsagePermission: CAMERA,
          locationUsagePermission: LOCATION,
          photosPermission: PHOTOS,
          savePhotosPermission: PHOTOS,
          microphoneUsagePermission: "Wadzzo doesn't record audio.",
        },
        android: { xRMode: ["AR"] },
      },
    ],
    // Download token comes from the RNMAPBOX_MAPS_DOWNLOAD_TOKEN env var
    // (.env locally, EAS env for cloud builds) — never in this file.
    ["@rnmapbox/maps", { RNMapboxMapsImpl: "mapbox" }],
    // Murals detector (MobileCLIP S0 TFLite, run in a VisionCamera frame
    // processor). CoreML is tried first on iOS, falling back to CPU.
    ["react-native-fast-tflite", { enableCoreMLDelegate: true }],
    [
      "@react-native-google-signin/google-signin",
      { iosUrlScheme: reversedClientId(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    router: { origin: false },
    "eas": {
      "projectId": "166cdf10-31b0-43b3-9bf4-cd1b1d826e90"
    }
  },
});
