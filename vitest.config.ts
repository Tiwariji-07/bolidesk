import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["src/**/*.test.ts"], exclude: ["src/**/*.db.test.ts"] } },
      // Real Postgres: locks, counters, partial indexes and sessions cannot be proven with mocks.
      { resolve: { alias }, test: { name: "db", include: ["src/**/*.db.test.ts"], setupFiles: ["src/test/db-setup.ts"], fileParallelism: false, testTimeout: 30_000, hookTimeout: 60_000 } },
    ],
  },
});
