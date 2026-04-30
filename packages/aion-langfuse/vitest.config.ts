import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@deltakit/aion": new URL("../aion/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
  },
});
