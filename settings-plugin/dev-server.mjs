#!/usr/bin/env node

/**
 * Streamline Settings Plugin Dev Server
 *
 * Loads the built plugin.js in a Node.js VM, serves its pages via HTTP,
 * and proxies /api/v1/* requests to a running Streamline Bridge instance.
 *
 * Usage:
 *   npm run serve                          # defaults: port 4555, bridge at localhost:8080
 *   PORT=4000 BRIDGE_URL=http://192.168.1.5:8080 npm run serve
 *
 * Pair with `npm run dev` in another terminal for watch builds — the server
 * auto-reloads plugin.js when it changes on disk.
 */

import { createServer, request as httpRequest } from "node:http";
import { connect as netConnect } from "node:net";
import { readFileSync, watch } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_PATH = resolve(
  __dirname,
  "../streamline-settings.reaplugin/plugin.js"
);

// Not 4444: the dye2 dev server owns that one, and both run side by side during the port.
const PORT = parseInt(process.env.PORT || "4555", 10);
const BRIDGE_URL = process.env.BRIDGE_URL || "http://localhost:8080";
const bridgeUrl = new URL(BRIDGE_URL);

// ── Plugin loading ──────────────────────────────────────────────────

let plugin = null;

function loadPlugin() {
  const src = readFileSync(PLUGIN_PATH, "utf-8");
  const context = vm.createContext({ console, setTimeout, clearTimeout });
  const script = new vm.Script(src, { filename: "plugin.js" });
  script.runInContext(context);

  const mockHost = {
    log: (...args) => console.log("[plugin]", ...args),
    emit: (name, payload) =>
      console.log("[plugin:emit]", name, JSON.stringify(payload)),
    storage: (cmd) =>
      console.log("[plugin:storage]", JSON.stringify(cmd)),
  };

  plugin = context.createPlugin(mockHost);
  plugin.onLoad({});
  console.log(`Loaded plugin ${plugin.id} v${plugin.version}`);
}

// ── File watching ───────────────────────────────────────────────────

let reloadTimer = null;

function watchPlugin() {
  try {
    // Watch the directory, not the file: vite and git replace plugin.js rather than
    // editing it in place, and a file watch stays bound to the old (deleted) inode —
    // it goes silent and the server keeps serving the build it loaded at startup.
    watch(dirname(PLUGIN_PATH), (_event, filename) => {
      if (filename && filename !== basename(PLUGIN_PATH)) return;
      // Debounce: Vite may write the file in multiple passes
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        console.log("\nPlugin file changed — reloading...");
        try {
          loadPlugin();
        } catch (err) {
          console.error("Reload failed:", err.message);
        }
      }, 200);
    });
  } catch {
    console.warn(
      "Could not watch plugin.js — auto-reload disabled. Build the plugin first."
    );
  }
}

// ── API proxy ───────────────────────────────────────────────────────

function proxyRequest(req, res) {
  const options = {
    hostname: bridgeUrl.hostname,
    port: bridgeUrl.port || 80,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: bridgeUrl.host },
  };

  const proxyReq = httpRequest(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error(`Proxy error: ${err.message}`);
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`Proxy error: ${err.message}\nIs Streamline Bridge running at ${BRIDGE_URL}?`);
  });

  req.pipe(proxyReq, { end: true });
}

// ── WebSocket proxy ─────────────────────────────────────────────────
//
// api.js opens nine ReconnectingWebSockets (machine snapshot, scale, shotSettings,
// shotState, devices, display, update, and two plugin channels). In production the
// bridge serves the plugin and owns /ws/v1/* on the same origin, so they just work;
// under this dev server they would 404 and retry every few seconds forever, burying
// the console and leaving every live value on the page dead.
//
// Upgrades cannot go through the http proxy above — the socket is hijacked before a
// response — so the handshake is replayed onto a raw TCP connection to the bridge
// and the two sockets are piped together.
function proxyUpgrade(req, clientSocket, head) {
  const upstream = netConnect(
    { host: bridgeUrl.hostname, port: bridgeUrl.port || 80 },
    () => {
      const headers = Object.entries(req.headers)
        // Rewrite Host so the bridge sees its own authority, not the dev server's.
        .map(([k, v]) => (k.toLowerCase() === "host" ? `Host: ${bridgeUrl.host}` : `${k}: ${v}`))
        .join("\r\n");
      upstream.write(`GET ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
      if (head && head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    }
  );

  const drop = (why) => (err) => {
    // A closed tab tearing down a socket is routine; only say something useful.
    if (err && err.code !== "ECONNRESET" && err.code !== "EPIPE") {
      console.error(`WS proxy ${why}: ${err.message}`);
    }
    upstream.destroy();
    clientSocket.destroy();
  };
  upstream.on("error", drop(`-> ${BRIDGE_URL}${req.url}`));
  clientSocket.on("error", drop("<- browser"));
}

// ── Plugin page handler ─────────────────────────────────────────────

function handlePluginPage(endpoint, req, res) {
  if (!plugin) {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("Plugin not loaded. Build it first: npm run build");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const query = Object.fromEntries(url.searchParams.entries());

  const request = {
    requestId: `dev-${Date.now()}`,
    endpoint,
    method: req.method,
    headers: req.headers,
    body: null,
    query,
  };

  try {
    const response = plugin.__httpRequestHandler(request);
    // Handle both sync and async responses
    Promise.resolve(response).then((resp) => {
      res.writeHead(resp.status, resp.headers);
      res.end(resp.body);
    });
  } catch (err) {
    console.error(`Handler error for /${endpoint}:`, err.message);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(`Plugin error: ${err.message}`);
  }
}

// ── HTTP server ─────────────────────────────────────────────────────

// Must match manifest.src.json. "ui" rather than "settings" — Decaid reserves
// /plugins/{id}/settings for its own settings API (see src/plugin.ts).
const PLUGIN_ROUTES = ["ui", "app", "i18n.csv", "iro", "easymde", "easymde.css", "easymde-icons.css", "inter.css", "notes-modal.css"];

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  // Plugin page routes
  for (const route of PLUGIN_ROUTES) {
    if (pathname === `/${route}`) {
      handlePluginPage(route, req, res);
      return;
    }
  }

  // Proxy API calls to Streamline Bridge
  if (pathname.startsWith("/api/")) {
    proxyRequest(req, res);
    return;
  }

  // Index page — list available routes
  if (pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!DOCTYPE html>
<html><head><title>Settings Dev Server</title>
<style>body{font-family:system-ui;max-width:600px;margin:2em auto;background:#1a1a1a;color:#e0e0e0}
a{color:#6cf;display:block;padding:.5em 0;font-size:1.2em}h1{border-bottom:1px solid #333;padding-bottom:.5em}
code{background:#333;padding:.2em .4em;border-radius:3px;font-size:.9em}</style></head>
<body><h1>Settings Dev Server</h1>
<p>Plugin: <code>${plugin ? `${plugin.id} v${plugin.version}` : "not loaded"}</code></p>
<p>Bridge: <code>${BRIDGE_URL}</code></p>
<h2>Pages</h2>
${PLUGIN_ROUTES.map((r) => `<a href="/${r}">/${r}</a>`).join("\n")}
<h2>API Proxy</h2>
<p>All <code>/api/v1/*</code> requests are proxied to the bridge.</p>
</body></html>`);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

// ── Start ───────────────────────────────────────────────────────────

try {
  loadPlugin();
} catch (err) {
  console.error(`Failed to load plugin: ${err.message}`);
  console.error("Build it first: cd settings-plugin && npm run build");
  process.exit(1);
}

watchPlugin();

server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/ws/")) {
    proxyUpgrade(req, socket, head);
    return;
  }
  socket.destroy();
});

server.listen(PORT, () => {
  console.log(`\nSettings Dev Server running at http://localhost:${PORT}`);
  console.log(`Proxying /api/v1/* and /ws/v1/* → ${BRIDGE_URL}`);
  console.log(`Watching ${PLUGIN_PATH} for changes\n`);
  console.log("Routes:");
  for (const route of PLUGIN_ROUTES) {
    console.log(`  http://localhost:${PORT}/${route}`);
  }
  console.log();
});
