import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Only pure logic is unit-tested (mapping, schemas, the outbox reducer), so
// the default node environment is enough — no jsdom, no React plugin.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
