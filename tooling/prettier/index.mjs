/** One formatting style for every package and app in the monorepo. */
/** @type {import("prettier").Config} */
const config = {
  plugins: ["prettier-plugin-tailwindcss"],
  printWidth: 100,
  singleQuote: false,
  trailingComma: "all",
  tailwindFunctions: ["cn", "cva"],
};

export default config;
