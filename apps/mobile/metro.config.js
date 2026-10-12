const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Viro loads 3D models and environment maps as assets.
config.resolver.assetExts.push("obj", "mtl", "glb", "gltf", "vrx", "hdr", "fbx", "bin");

module.exports = withNativeWind(config, { input: "./global.css" });
