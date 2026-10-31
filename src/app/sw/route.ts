import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Serves the service worker at /sw.js (rewritten here by next.config.ts).
 *
 * Why a route handler and not public/sw.js? The worker's cache names are
 * stamped with the deployment's build id at serve time, so every deploy
 * ships byte-different worker bytes. The browser then runs the standard
 * update flow (install → skipWaiting → activate) and the new worker
 * deletes every cache from previous deployments. Without this, the
 * hardcoded "biochem-v1" caches accumulated across deployments and the
 * worker happily served pages from an old deployment whose chunks no
 * longer exist — surfacing as ChunkLoadError or React hydration error
 * #418 for returning visitors right after a redeploy.
 *
 * The worker itself stays bundler-independent plain JavaScript (see the
 * comment in next.config.ts) — it is only wrapped in a template literal
 * here, so it must not contain backticks or ${ sequences.
 */

const SW_SOURCE = `
/* BioChem service worker — bundler-independent (works with Turbopack).
 *
 * Capabilities:
 *  - App-shell precache + deployment-versioned runtime caches
 *  - Offline fallback page for navigations
 *  - Cache-first for immutable static assets
 *  - Network-first with cache fallback for GET API reads (offline study)
 *  - Background sync replay of queued mutations (IndexedDB queue)
 *  - Web push notifications + notification click routing
 *
 * VERSION is stamped per deployment by src/app/sw/route.ts. All cache
 * names derive from it, so a new deployment starts from clean caches
 * and activate() below deletes anything left from older deployments.
 */

const VERSION = "__SW_VERSION__";
const SHELL_CACHE = VERSION + "-shell";
const STATIC_CACHE = VERSION + "-static";
const PAGE_CACHE = VERSION + "-pages";
const API_CACHE = VERSION + "-api";
const QUEUE_DB = "biochem-sync";
const QUEUE_STORE = "requests";

const APP_SHELL = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        APP_SHELL.map((url) => cache.add(new Request(url, { cache: "reload" }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

/* ---------------- Fetch strategies ---------------- */

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|avif|ico)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (request.method !== "GET") return; // mutations go through the sync queue
  if (url.pathname.startsWith("/api/ai/")) return; // never cache AI streams
  if (url.pathname === "/sw.js" || url.pathname === "/manifest.webmanifest") return;

  // Page navigations: network-first, fall back to cache, then offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(PAGE_CACHE);
          cache.put(request, response.clone());
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match("/offline");
          if (offline) return offline;
          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
      })(),
    );
    return;
  }

  // Immutable static assets: cache-first.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // GET API reads (notes, questions, attempts…): network-first, cache fallback
  // so previously-viewed study material works offline.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(API_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(JSON.stringify({ error: "Offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
      })(),
    );
  }
});

/* ---------------- Background sync queue ---------------- */

function openQueue() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(QUEUE_DB, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function replayQueue() {
  const db = await openQueue();
  const tx = db.transaction(QUEUE_STORE, "readwrite");
  const store = tx.objectStore(QUEUE_STORE);
  const all = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  for (const item of all) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
        credentials: "include",
      });
      if (response.ok || response.status === 401 || response.status === 403) {
        // Success, or permanently rejected by the server — drop either way.
        store.delete(item.id);
      }
    } catch {
      // Still offline — keep for the next sync event.
      return;
    }
  }
  await tx.complete;
}

self.addEventListener("sync", (event) => {
  if (event.tag === "biochem-sync") {
    event.waitUntil(replayQueue());
  }
});

/* ---------------- Push notifications ---------------- */

self.addEventListener("push", (event) => {
  let data = { title: "BioChem", body: "", url: "/dashboard" };
  try {
    if (event.data) data = Object.assign({}, data, event.data.json());
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
      tag: "biochem-notification",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
`;

let cachedVersion: string | null = null;

/** Deployment token: unique per deployment, stable for its lifetime. */
function deploymentVersion(): string {
  if (cachedVersion) return cachedVersion;
  let version = "";
  try {
    // Vercel injects the deployment id at runtime when available.
    version = process.env.VERCEL_DEPLOYMENT_ID ?? "";
  } catch {
    version = "";
  }
  if (!version) {
    try {
      // next build writes a fresh BUILD_ID per build; on Vercel the build
      // output (including .next) ships with the serverless function, so
      // reading it at runtime identifies the exact deployed build.
      version = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
    } catch {
      version = "";
    }
  }
  cachedVersion = version || "dev";
  return cachedVersion;
}

export function GET(): Response {
  return new Response(SW_SOURCE.replaceAll("__SW_VERSION__", deploymentVersion()), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Service-Worker-Allowed": "/",
    },
  });
}
