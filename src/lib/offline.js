// Small IndexedDB helpers for working without signal: a key/value store for the
// visit cache and the queue of unsent changes, and a store for voice-note
// recordings until they've been uploaded. IndexedDB (not localStorage) because
// visits carry photos and recordings that quickly outgrow localStorage's ~5 MB.

const DB_NAME = "fvt-offline";
const DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("media")) db.createObjectStore("media");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req && "result" in req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Every helper swallows storage errors (private browsing, quota): the app then
// simply behaves as an online-only app instead of breaking.
export const kvGet = (key) => run("kv", "readonly", (s) => s.get(key)).catch(() => undefined);
export const kvSet = (key, value) => run("kv", "readwrite", (s) => s.put(value, key)).catch(() => undefined);

export const mediaPut = (id, blob) => run("media", "readwrite", (s) => s.put(blob, id)).catch(() => undefined);
export const mediaGet = (id) => run("media", "readonly", (s) => s.get(id)).catch(() => undefined);
export const mediaDel = (id) => run("media", "readwrite", (s) => s.delete(id)).catch(() => undefined);
