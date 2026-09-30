import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Dummy secrets — encryption.ts / webhook-signature.ts read these
    // at module load. Tests never hit a real Meta/Supabase service, so
    // any 32-byte hex / non-empty string will do; keep them lexically
    // identical to the CI build env so behaviour matches.
    env: {
      ENCRYPTION_KEY:
        "0000000000000000000000000000000000000000000000000000000000000000",
      META_APP_SECRET: "test-meta-app-secret",
      // Unit tests exercise the Meta adapter with mocked network calls. The
      // application defaults remain dry-run; this only prevents the safety
      // gate from masking transport and persistence behaviour in tests.
      MESSAGING_DELIVERY_MODE: "live",
      MESSAGING_LIVE_APPROVED: "true",
    },
    clearMocks: true,
  },
});
