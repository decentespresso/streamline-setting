import { defineConfig } from "vite";
import { resolve } from "path";
import { mkdirSync, copyFileSync, readFileSync } from "fs";

// Release CI patches the version in manifest.src.json (and package.json) from the git
// tag. Injecting it here keeps plugin.ts from carrying a second copy that CI never
// touches — dye2's plugin.ts drifted that way and reports a stale version.
const manifest = JSON.parse(
  readFileSync(resolve(__dirname, "manifest.src.json"), "utf-8")
);

export default defineConfig({
  define: {
    __PLUGIN_ID__: JSON.stringify(manifest.id),
    __PLUGIN_VERSION__: JSON.stringify(manifest.version),
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/plugin.ts"),
      name: "createPlugin",
      formats: ["iife"],
      fileName: () => "plugin.js",
    },
    outDir: resolve(__dirname, "../streamline-settings.reaplugin"),
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      output: {
        // Wrap in a function that flutter_js can call
        // The IIFE should expose createPlugin on globalThis
        footer: "",
      },
    },
  },
  plugins: [
    {
      name: "copy-manifest",
      closeBundle() {
        const outDir = resolve(__dirname, "../streamline-settings.reaplugin");
        mkdirSync(outDir, { recursive: true });
        // The source manifest is deliberately NOT named manifest.json: Decaid
        // resolves a branch-source plugin root by looking for directories that
        // contain a manifest.json, and refuses to install when it finds more
        // than one. Only the build output may carry that name.
        copyFileSync(
          resolve(__dirname, "manifest.src.json"),
          resolve(outDir, "manifest.json")
        );
      },
    },
  ],
});
