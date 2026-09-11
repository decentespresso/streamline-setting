/// <reference path="./host.d.ts" />

import { renderSettingsPage } from "./pages/settings";
import { renderAppBundle } from "./assets/app-bundle";
import { renderI18nCsv } from "./assets/i18n-csv";
import { renderIro, renderEasyMde, renderEasyMdeCss, renderEasyMdeIconsCss } from "./assets/vendor-assets";

// Injected by vite from manifest.src.json — see vite.config.ts.
declare const __PLUGIN_ID__: string;
declare const __PLUGIN_VERSION__: string;

const PLUGIN_ID = __PLUGIN_ID__;
const PLUGIN_VERSION = __PLUGIN_VERSION__;

export default function createPlugin(host: PluginHost): PluginInstance {
  function log(msg: string) {
    host.log(`[settings] ${msg}`);
  }

  return {
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,

    onLoad(_settings: Record<string, unknown>) {
      log("Settings plugin loaded");
    },

    onUnload() {
      log("Settings plugin unloaded");
    },

    onEvent(_event: PluginEvent) {
      // Phase 1: no event processing.
    },

    __httpRequestHandler(request: HttpRequest): HttpResponse {
      log(`HTTP ${request.method} ${request.endpoint}`);

      switch (request.endpoint) {
        case "settings":
          return renderSettingsPage(request);

        // Not a page: the browser-side settings bundle the page loads.
        case "app":
          return renderAppBundle(request);

        // Not a page: the translation table i18n.js fetches on boot.
        case "i18n.csv":
          return renderI18nCsv(request);

        // Not pages: vendored libraries, loaded on demand by vendor-loader.js.
        case "iro":
          return renderIro(request);

        case "easymde":
          return renderEasyMde(request);

        case "easymde.css":
          return renderEasyMdeCss(request);

        case "easymde-icons.css":
          return renderEasyMdeIconsCss(request);

        default:
          return {
            requestId: request.requestId,
            status: 404,
            headers: { "Content-Type": "text/plain" },
            body: "Not found",
          };
      }
    },
  };
}
