// @ts-nocheck: config module (JS); consumed by eslint only
// One lint setup for every package and app.
//   baseConfig(...)  libraries and services (TypeScript only)
//   nextConfig(...)  Next.js apps (adds the Next + React rules)
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const IGNORES = [
  ".next/**",
  ".turbo/**",
  "dist/**",
  "node_modules/**",
  "public/**",
  "next-env.d.ts",
  "e2e/**",
  "tests/**",
  "script.ts",
];

/** Rules that keep the code typed and its errors coded. */
const typedRules = {
  "@typescript-eslint/array-type": "off",
  "@typescript-eslint/consistent-type-definitions": "off",
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-floating-promises": "warn",
  "@typescript-eslint/consistent-type-imports": [
    "warn",
    { prefer: "type-imports", fixStyle: "inline-type-imports" },
  ],
  "@typescript-eslint/no-unused-vars": [
    "warn",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
  ],
  "@typescript-eslint/require-await": "off",
  "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  // Style rules report, they don't fail the build.
  "@typescript-eslint/prefer-nullish-coalescing": "warn",
  "@typescript-eslint/prefer-optional-chain": "warn",
  "@typescript-eslint/prefer-regexp-exec": "warn",
  "@typescript-eslint/no-unnecessary-type-assertion": "warn",
  "@typescript-eslint/restrict-template-expressions": "warn",
  "@typescript-eslint/await-thenable": "warn",
  // Errors carry a stable code: `throw new AppError(ErrorCodes.X, { message })`.
  "no-restricted-syntax": [
    "warn",
    {
      selector: "ThrowStatement > NewExpression[callee.name='Error']",
      message: "Throw an AppError with an ErrorCodes code instead of a bare Error.",
    },
  ],
};

/**
 * React Compiler checks introduced with react-hooks 7. They flag patterns that
 * work today (refs read in render, state set in effects); fixing them is a
 * refactor per screen, so they report until that happens.
 */
const reactCompilerRules = Object.fromEntries(
  [
    "refs",
    "set-state-in-effect",
    "static-components",
    "use-memo",
    "immutability",
    "preserve-manual-memoization",
    "purity",
    "globals",
    "error-boundaries",
    "unsupported-syntax",
    "incompatible-library",
    "gating",
    "config",
  ].map((rule) => [`react-hooks/${rule}`, "warn"]),
);

const typeChecked = (tsconfigRootDir) => ({
  files: ["**/*.ts", "**/*.tsx"],
  extends: [tseslint.configs.recommendedTypeChecked, tseslint.configs.stylisticTypeChecked],
  languageOptions: { parserOptions: { projectService: true, tsconfigRootDir } },
  rules: typedRules,
});

/** @param {{ tsconfigRootDir: string }} options */
export function baseConfig({ tsconfigRootDir }) {
  return tseslint.config({ ignores: IGNORES }, typeChecked(tsconfigRootDir));
}

/** @param {{ tsconfigRootDir: string }} options */
export function nextConfig({ tsconfigRootDir }) {
  return tseslint.config(
    { ignores: IGNORES },
    ...nextCoreWebVitals,
    ...nextTypescript,
    typeChecked(tsconfigRootDir),
    { rules: reactCompilerRules },
  );
}
