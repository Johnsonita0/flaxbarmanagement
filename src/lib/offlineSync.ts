import { supabase } from "./supabase";

export interface OfflineOperation {
  id: string;
  userId: string;
  key: string;
  path: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
  createdAt: number;
  status: "pending" | "syncing" | "review";
  message: string | null;
  leaseUntil?: number;
}

interface CachedResponse {
  key: string;
  userId: string;
  body: unknown;
  cachedAt: number;
}

const databaseName = "flexbar-offline-v1";
const databaseVersion = 1;
const queueStore = "outbox";
const responseStore = "responses";
let databasePromise: Promise<IDBDatabase> | null = null;
let syncInProgress = false;

function openDatabase(): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) return Promise.reject(new Error("This browser does not support offline storage."));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(queueStore)) {
        const store = database.createObjectStore(queueStore, { keyPath: "id" });
        store.createIndex("userId", "userId");
        store.createIndex("createdAt", "createdAt");
      }
      if (!database.objectStoreNames.contains(responseStore)) {
        const store = database.createObjectStore(responseStore, { keyPath: "key" });
        store.createIndex("userId", "userId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Offline storage could not be opened."));
    };
    request.onblocked = () => reject(new Error("Offline storage is blocked by another open Flex Bar tab."));
  });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage request failed."));
  });
}

async function storeValue<T>(storeName: string, value: T): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline data could not be saved."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline data save was cancelled."));
  });
}

function emitQueueChanged() {
  window.dispatchEvent(new Event("flexbar:offline-queue-changed"));
}

export function isOfflineCapableWrite(path: string, method: string) {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return false;
  if (!path.startsWith("/api/v1/")) return false;
  return !/^\/api\/v1\/(session|calls|call-push|push-notifications|chat|attendance)(\/|$)/.test(path)
    && !/^\/api\/v1\/admin\/users(\/|$)/.test(path)
    && !/^\/api\/v1\/profile\/lock-pin(\/|$)/.test(path);
}

export function createOfflineOperationKey() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export async function cacheApiResponse(userId: string, path: string, body: unknown) {
  const key = `${userId}:${path}`;
  await storeValue<CachedResponse>(responseStore, { key, userId, body, cachedAt: Date.now() });
}

export async function cacheVerifiedDeviceSession(userId: string) {
  await cacheApiResponse(userId, "__verified_device_session__", true);
}

export async function hasVerifiedDeviceSession(userId: string) {
  return (await getCachedApiResponse<boolean>(userId, "__verified_device_session__")) === true;
}

export async function getCachedApiResponse<T>(userId: string, path: string): Promise<T | null> {
  const database = await openDatabase();
  const transaction = database.transaction(responseStore, "readonly");
  const result = await requestResult(transaction.objectStore(responseStore).get(`${userId}:${path}`)) as CachedResponse | undefined;
  return result ? result.body as T : null;
}

export async function clearCachedApiResponses(userId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(responseStore, "readwrite");
  const cursorRequest = transaction.objectStore(responseStore).index("userId").openCursor(userId);
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    cursor.delete();
    cursor.continue();
  };
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Cached workspace data could not be cleared."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Cached workspace data could not be cleared."));
  });
}

export async function enqueueOfflineOperation(operation: OfflineOperation) {
  await storeValue(queueStore, operation);
  emitQueueChanged();
}

export async function getOfflineOperations(userId?: string): Promise<OfflineOperation[]> {
  const database = await openDatabase();
  const transaction = database.transaction(queueStore, "readonly");
  const store = transaction.objectStore(queueStore);
  const result = userId
    ? await requestResult(store.index("userId").getAll(userId))
    : await requestResult(store.getAll());
  return (result as OfflineOperation[]).sort((left, right) => left.createdAt - right.createdAt);
}

async function updateOperation(operation: OfflineOperation) {
  await storeValue(queueStore, operation);
  emitQueueChanged();
}

async function claimOperation(id: string): Promise<OfflineOperation | null> {
  const database = await openDatabase();
  const transaction = database.transaction(queueStore, "readwrite");
  const store = transaction.objectStore(queueStore);
  let claimed: OfflineOperation | null = null;
  const request = store.get(id);
  request.onsuccess = () => {
    const operation = request.result as OfflineOperation | undefined;
    if (!operation || operation.status === "review" || (operation.status === "syncing" && (operation.leaseUntil ?? 0) > Date.now())) return;
    claimed = { ...operation, status: "syncing", leaseUntil: Date.now() + 60_000 };
    store.put(claimed);
  };
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline action could not be reserved for sync."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline action sync reservation was cancelled."));
  });
  return claimed;
}

async function removeOperation(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(queueStore, "readwrite");
  transaction.objectStore(queueStore).delete(id);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Synced offline data could not be removed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline queue update was cancelled."));
  });
  emitQueueChanged();
}

export async function discardOfflineOperation(id: string) {
  await removeOperation(id);
}

function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL;
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");
  if (import.meta.env.DEV) return "http://localhost:3000";
  throw new Error("Account services are temporarily unavailable.");
}

export async function syncOfflineOperations(): Promise<void> {
  if (syncInProgress || !navigator.onLine || !supabase) return;
  syncInProgress = true;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return;
    const operations = await getOfflineOperations(data.session.user.id);
    for (const operation of operations) {
      if (operation.status === "review") continue;
      const claimedOperation = await claimOperation(operation.id);
      if (!claimedOperation) continue;
      let response: Response;
      try {
        response = await fetch(`${getApiBaseUrl()}${claimedOperation.path}`, {
          method: claimedOperation.method,
          headers: {
            ...claimedOperation.headers,
            Authorization: `Bearer ${data.session.access_token}`,
            "Idempotency-Key": claimedOperation.key,
          },
          ...(claimedOperation.body === null ? {} : { body: claimedOperation.body }),
        });
      } catch {
        await updateOperation({ ...claimedOperation, status: "pending", leaseUntil: undefined });
        break;
      }

      const responseBody = await response.json().catch(() => null) as { code?: string; error?: string } | null;
      if (response.ok) {
        await removeOperation(claimedOperation.id);
        continue;
      }
      const message = responseBody?.error ?? `The server rejected this saved action (HTTP ${response.status}).`;
      await updateOperation({
        ...claimedOperation,
        status: "review",
        leaseUntil: undefined,
        message: responseBody?.code === "OFFLINE_OPERATION_IN_PROGRESS"
          ? "The server received this action but could not confirm its result. Review the original record before retrying."
          : message,
      });
    }
  } finally {
    syncInProgress = false;
  }
}
