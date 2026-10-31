"use client";

/**
 * Offline mutation queue.
 *
 * Wraps fetch for write operations (ticking outcomes, reviewing flashcards,
 * autosaving mock answers…). When the request fails because the device is
 * offline, it is stored in IndexedDB and replayed by the service worker on
 * the next background sync.
 */

const QUEUE_DB = "biochem-sync";
const QUEUE_STORE = "requests";

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(QUEUE_DB, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error("IndexedDB unavailable"));
  });
}

/** SyncManager is not in the default DOM lib — declared locally. */
interface SyncRegistration extends ServiceWorkerRegistration {
  sync: { register: (tag: string) => Promise<void> };
}

async function enqueue(url: string, init: RequestInit): Promise<void> {
  const db = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).add({
      url,
      method: init.method ?? "POST",
      headers: (init.headers as Record<string, string>) ?? { "Content-Type": "application/json" },
      body: typeof init.body === "string" ? init.body : null,
      queuedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Queue write failed"));
  });

  if ("serviceWorker" in navigator && "SyncManager" in window) {
    try {
      const registration = (await navigator.serviceWorker.ready) as SyncRegistration;
      await registration.sync.register("biochem-sync");
    } catch {
      // Sync registration can fail on some browsers; the SW also replays on activate.
    }
  }
}

export interface QueuedFetchResult {
  ok: boolean;
  status: number;
  queued?: boolean;
  body: unknown;
}

/**
 * Fetch wrapper with offline queueing. JSON in, JSON out.
 */
export async function queuedFetch<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<QueuedFetchResult & { body: T }> {
  try {
    const response = await fetch(url, { ...init, credentials: "include" });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body: body as T };
  } catch {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueue(url, init);
      return {
        ok: true,
        status: 0,
        queued: true,
        body: { queued: true } as T,
      };
    }
    throw new Error("Network request failed");
  }
}

/** Queues a JSON POST/PUT/DELETE when offline, transparently. */
export function queuedJson(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  payload: unknown,
): Promise<QueuedFetchResult> {
  return queuedFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
