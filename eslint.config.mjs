import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // v2 UI text goes through t() (src/lib/i18n), so it can be shown in Chinese.
  {
    files: ["src/app/app/**/*.tsx", "src/components/v2/**/*.tsx"],
    rules: { "react/jsx-no-literals": ["error", { noStrings: false, ignoreProps: true }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
