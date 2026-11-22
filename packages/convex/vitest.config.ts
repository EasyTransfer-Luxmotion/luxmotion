import { defineConfig } from "vitest/config";

// convex-test runs the real functions in an edge-like runtime, against an
// in-memory database: no deployment, no network.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["tests/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
