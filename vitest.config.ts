import path from "path";
import { defineConfig } from "vitest/config";

const dirname = import.meta.dirname;

// Integration tests talk to the real database (DATABASE_URL) via Payload's local API -
// there is no mocked adapter for a Postgres-specific adapter feature like transactions.
// Run serially (no parallel workers) so tests that assert on committed rows never race
// each other over the same connection pool.
export default defineConfig({
  resolve: {
    alias: {
      "@payload-config": path.resolve(dirname, "./payload.config.ts"),
      "@": dirname,
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["./vitest.setup.ts"],
  },
});
