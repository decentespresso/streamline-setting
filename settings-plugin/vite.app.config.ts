import { defineConfig } from "vite";
import { resolve } from "path";

// Second build: the browser-side settings app.
//
// The ported settings code is ~10k lines of real ES modules with ~26 imports
// (see PORT_PLAN.md §2) — authoring it as template strings the way dye2 does
// would be a rewrite, not a port. So it is bundled separately here and the
// result is embedded into plugin.js as text (src/assets/app-bundle.ts), which
// keeps the port a port.
//
// Runs before the plugin build: `npm run build` chains them, and the output
// lands under src/ so the plugin build's watcher treats it as a dependency.
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/app/main.js"),
      formats: ["iife"],
      name: "streamlineSettings",
      fileName: () => "app.js",
    },
    outDir: resolve(__dirname, "src/generated"),
    emptyOutDir: false,
    // Unminified like plugin.js: this has to be debuggable in a tablet WebView,
    // and the bundle rides inside plugin.js where size is already a non-issue
    // (dye2 ships 1.5 MB).
    minify: false,
  },
});
