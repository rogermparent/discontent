import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import pluginMocha from "eslint-plugin-mocha";
import pluginPlaywright from "eslint-plugin-playwright";

const eslintConfig = defineConfig([
  pluginMocha.configs.recommended,
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: {
        rootDir: [
          "websites/portfolio/common",
          "websites/portfolio/editor",
          "websites/portfolio/export",
          "websites/recipe-website/common",
          "websites/recipe-website/editor",
          "websites/recipe-website/export",
          "websites/resume-builder",
        ],
      },
    },
    rules: {
      "mocha/no-exclusive-tests": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ["**/playwright/**/*.{ts,tsx}"],
    plugins: { playwright: pluginPlaywright },
    rules: {
      "playwright/no-focused-test": "error",
      "playwright/missing-playwright-await": "error",
      // Playwright fixtures use `use(value)` to inject the fixture; the
      // React Hooks rule misinterprets the bare `use` identifier as a hook.
      "react-hooks/rules-of-hooks": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next. Restated with a `**/` prefix:
    // the bare form anchors at the repo root, so build output under a nested
    // package (`packages/cms/demo/.next`) was being linted.
    ".next/**",
    "**/.next/**",
    "out/**",
    "**/out/**",
    "build/**",
    "**/build/**",
    "next-env.d.ts",
    "**/next-env.d.ts",
  ]),
]);

export default eslintConfig;
