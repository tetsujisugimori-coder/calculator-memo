import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sourceBuildProof } from "./e2e/source-build-proof.mjs";

export default defineConfig({
  base: "/calculator-memo/",
  root: "github-pages",
  publicDir: "../public",
  plugins: [sourceBuildProof("pages"), react()],
  build: {
    outDir: "../dist-pages",
    emptyOutDir: true,
  },
});
