import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Flat config for ESLint 9 + Next.js 16.
// `next lint` was removed in Next 16 — ESLint runs directly via `pnpm lint`.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // These two are stylistic/aggressive React-Compiler rules. The codebase
      // intentionally initializes state on mount via effects (localStorage,
      // Electron IPC) and uses `any` for Electron bridge interop. Keep them
      // visible as warnings without failing CI on existing patterns.
      "react-hooks/set-state-in-effect": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "dist/**",
    "build/**",
    "node_modules/**",
    "next-env.d.ts",
    "desktop/baked-config.json",
    "installers/**",
    // Electron main-process files are plain CJS, not covered by Next's config.
    "desktop/*.cjs",
    "desktop/*.mjs",
    "desktop/*.d.mts",
    "desktop/preload.js",
    "scripts/**",
  ]),
]);