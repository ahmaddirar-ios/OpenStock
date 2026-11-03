import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  // tsconfig keeps Next's `"jsx": "preserve"` (Next does the transform), so a .tsx test would reach
  // the runner as raw JSX. The component tests opt into jsdom with a `@vitest-environment` docblock.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
