// Images imported by the wallet UI: Next.js turns these imports into
// StaticImageData (url, width, height) in every app that uses this package.
// (Next's own declaration types SVG as `any`, so both are declared here.)
/* eslint-disable @typescript-eslint/consistent-type-imports */
declare module "*.png" {
  const image: import("next/image").StaticImageData;
  export default image;
}
declare module "*.svg" {
  const image: import("next/image").StaticImageData;
  export default image;
}
