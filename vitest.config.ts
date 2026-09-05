import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // Les tests d'intégration RLS ont leur propre config (vitest.integration.config.ts) :
    // ils appellent le vrai Supabase distant, ne doivent pas tourner par défaut.
    exclude: ["**/node_modules/**", "src/test/integration/**"],
  },
});
