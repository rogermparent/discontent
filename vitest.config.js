import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setupTests.js"],
    // Unit tests live in `test/`, and only there. Saying so explicitly fixes two
    // ways the default glob went wrong: it swept up the Playwright specs under
    // `websites/**/playwright/` (which throw "did not expect test.describe() to
    // be called here" under a vitest runner), and it collected every test file
    // once more per checkout in `.claude/worktrees/*`.
    include: ["test/**/*.{test,spec}.{js,jsx,ts,tsx}"],
    exclude: [".claude/**", "**/node_modules/**", "**/dist/**", "**/.next/**"],
    alias: {
      "next/cache": resolve("test", "stub_cache.js"),
      "next/navigation": resolve("test", "stub_navigation.js"),
      "@/auth": resolve("test", "stub_auth.js"),
      "discontent/fs/getContentDirectory": resolve(
        "test",
        "stub_content_directory.js",
      ),
    },
  },
});
