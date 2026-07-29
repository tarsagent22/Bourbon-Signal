import type { UserAlertPreferences } from "@/app/api/user/preferences/route";

const DATABASE_NAME = "bourbon-signal-local";
const STORE_NAME = "pending-collections";
const DATABASE_VERSION = 1;
const FALLBACK_PREFIX = "bs:pending-collection:";

export interface PendingCollection {
  userId: string;
  collectionPreferences: UserAlertPreferences["collectionPreferences"];
  operationId: string;
  savedAt: string;
  blockedByConflict?: boolean;
}

function normalizePending(value: unknown): PendingCollection | null {
  if (!value || typeof value !== "object") return null;
  const pending = value as PendingCollection;
  if (!pending.userId || !pending.collectionPreferences || !pending.savedAt) return null;
  return { ...pending, operationId: pending.operationId || pending.savedAt };
}

function fallbackKey(userId: string) {
  return `${FALLBACK_PREFIX}${userId}`;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function localStorageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readFallback(userId: string) {
  if (!localStorageAvailable()) return null;
  try {
    return normalizePending(JSON.parse(window.localStorage.getItem(fallbackKey(userId)) || "null"));
  } catch {
    return null;
  }
}

export async function readPendingCollection(userId: string): Promise<PendingCollection | null> {
  if (!userId) return null;
  const fallback = readFallback(userId);
  const database = await openDatabase();
  if (database) {
    try {
      const pending = await new Promise<PendingCollection | null>((resolve) => {
        const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(userId);
        request.onsuccess = () => resolve(normalizePending(request.result));
        request.onerror = () => resolve(null);
      });
      if (pending) return fallback && fallback.savedAt >= pending.savedAt ? fallback : pending;
    } finally {
      database.close();
    }
  }
  return fallback;
}

export async function writePendingCollection(
  userId: string,
  collectionPreferences: UserAlertPreferences["collectionPreferences"],
): Promise<PendingCollection | null> {
  const operationId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pending: PendingCollection = {
    userId,
    collectionPreferences,
    operationId,
    savedAt: new Date().toISOString(),
    blockedByConflict: false,
  };
  const database = await openDatabase();
  if (database) {
    try {
      const stored = await new Promise<boolean>((resolve) => {
        const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(pending);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
      if (stored) {
        if (localStorageAvailable()) {
          try { window.localStorage.setItem(fallbackKey(userId), JSON.stringify(pending)); } catch { /* best effort mirror */ }
        }
        return pending;
      }
    } finally {
      database.close();
    }
  }
  if (!localStorageAvailable()) return null;
  try {
    window.localStorage.setItem(fallbackKey(userId), JSON.stringify(pending));
    return pending;
  } catch {
    return null;
  }
}

export async function markPendingCollectionConflict(userId: string, expectedOperationId: string) {
  const database = await openDatabase();
  if (database) {
    try {
      await new Promise<void>((resolve) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(userId);
        request.onsuccess = () => {
          const current = normalizePending(request.result);
          if (current?.operationId === expectedOperationId) store.put({ ...current, blockedByConflict: true });
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      });
    } finally {
      database.close();
    }
  }
  const fallback = readFallback(userId);
  if (fallback?.operationId === expectedOperationId && localStorageAvailable()) {
    try { window.localStorage.setItem(fallbackKey(userId), JSON.stringify({ ...fallback, blockedByConflict: true })); } catch { /* best effort */ }
  }
}

export async function clearPendingCollection(userId: string, expectedOperationId?: string) {
  if (!userId) return;
  const database = await openDatabase();
  if (database) {
    try {
      await new Promise<void>((resolve) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(userId);
        request.onsuccess = () => {
          const current = normalizePending(request.result);
          if (current && (!expectedOperationId || current.operationId === expectedOperationId)) store.delete(userId);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      });
    } finally {
      database.close();
    }
  }
  const fallback = readFallback(userId);
  if (fallback && (!expectedOperationId || fallback.operationId === expectedOperationId) && localStorageAvailable()) {
    try { window.localStorage.removeItem(fallbackKey(userId)); } catch { /* best effort */ }
  }
}

export async function syncPendingCollection(
  userId: string,
  submit: (collectionPreferences: UserAlertPreferences["collectionPreferences"], pending: PendingCollection) => Promise<UserAlertPreferences | null>,
) {
  const pending = await readPendingCollection(userId);
  if (!pending || pending.blockedByConflict) return null;
  const saved = await submit(pending.collectionPreferences, pending);
  await clearPendingCollection(userId, pending.operationId);
  return saved;
}
