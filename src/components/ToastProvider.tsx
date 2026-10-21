import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Clock3, Info, RefreshCw, Trash2, WifiOff, X } from "lucide-react";
import "../css/Toast.css";
import { clearCachedApiResponses, discardOfflineOperation, getOfflineOperations, syncOfflineOperations } from "../lib/offlineSync";
import { supabase } from "../lib/supabase";

export type ToastKind = "error" | "success" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, kind: ToastKind = "info") => {
    if (message.startsWith("OFFLINE_QUEUED:")) {
      message = message.slice("OFFLINE_QUEUED:".length);
      kind = "info";
    }
    const id = ++nextId.current;
    setToasts((current) => [...current.slice(-2), { id, kind, message }]);
    timers.current.set(id, window.setTimeout(() => dismissToast(id), 5000));
  }, [dismissToast]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);

  useEffect(() => {
    const handleOfflineStorageError = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      if (message) showToast(message, "error");
    };
    window.addEventListener("flexbar:offline-storage-error", handleOfflineStorageError);
    return () => window.removeEventListener("flexbar:offline-storage-error", handleOfflineStorageError);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <OfflineSyncStatus />
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map(({ id, kind, message }) => {
          const Icon = icons[kind];
          return (
            <div
              className={`toast toast--${kind}`}
              key={id}
              role={kind === "error" ? "alert" : "status"}
            >
              <Icon className="toast__icon" size={19} aria-hidden="true" />
              <p>{message}</p>
              <button
                className="toast__close"
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismissToast(id)}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

function operationTitle(path: string) {
  if (path.includes("/sales/sales")) return "Sale";
  if (path.includes("/attendance/")) return "Attendance";
  if (path.includes("/inventory/purchases/")) return "Vendor payment";
  if (path.includes("/inventory/purchases")) return "Vendor purchase";
  if (path.includes("/inventory/deliveries/") && path.endsWith("/receive")) return "Stock receipt";
  if (path.includes("/inventory/deliveries")) return "Stock movement";
  if (path.includes("/department/closures")) return "Shift close";
  if (path.includes("/department/meetings")) return "Department meeting";
  return path.split("?")[0].split("/").filter(Boolean).slice(-2).join(" · ") || "Business record";
}

function OfflineSyncStatus() {
  const [operations, setOperations] = useState<Awaited<ReturnType<typeof getOfflineOperations>>>([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const lastUserId = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeUserId) {
      setOperations([]);
      return;
    }
    try {
      setOperations(await getOfflineOperations(activeUserId));
    } catch (error: unknown) {
      console.error("Could not read Flex Bar's offline action queue.", error);
    }
  }, [activeUserId]);

  const sync = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await syncOfflineOperations();
    } catch (error: unknown) {
      console.error("Flex Bar could not sync saved offline actions.", error);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void sync();
    };
    const handleOffline = () => setOnline(false);
    const handleQueueChanged = () => { void refresh(); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("flexbar:offline-queue-changed", handleQueueChanged);
    void refresh();
    void sync();
    const timer = window.setInterval(() => {
      setOnline(navigator.onLine);
      void sync();
    }, 10_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("flexbar:offline-queue-changed", handleQueueChanged);
    };
  }, [refresh, sync]);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("Could not identify the signed-in user for offline sync.", error);
        return;
      }
      const userId = data.session?.user.id ?? null;
      lastUserId.current = userId;
      setActiveUserId(userId);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user.id ?? null;
      const previousUserId = lastUserId.current;
      lastUserId.current = nextUserId;
      setActiveUserId(nextUserId);
      if (previousUserId && previousUserId !== nextUserId) {
        void clearCachedApiResponses(previousUserId).catch((error: unknown) => {
          console.error("Cached workspace data could not be cleared after sign-out.", error);
        });
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function removeOperation(id: string) {
    if (!window.confirm("Permanently remove this unsynced action from this device? This cannot be undone.")) return;
    try {
      await discardOfflineOperation(id);
    } catch (error: unknown) {
      console.error("Could not remove the offline action.", error);
    }
  }

  const pendingCount = operations.filter((operation) => operation.status !== "review").length;
  const reviewCount = operations.filter((operation) => operation.status === "review").length;
  if (operations.length === 0 && online) return null;

  return (
    <section className="offline-sync" aria-label="Offline synchronization status">
      <div className={`offline-sync__summary${online ? "" : " offline-sync__summary--offline"}`}>
        {!online ? <WifiOff size={16} aria-hidden="true" /> : syncing ? <RefreshCw className="offline-sync__spinner" size={16} aria-hidden="true" /> : <Clock3 size={16} aria-hidden="true" />}
        <span>{!online ? "Offline" : syncing ? "Syncing saved records…" : "Online"}{operations.length ? ` · ${pendingCount} pending${reviewCount ? ` · ${reviewCount} need review` : ""}` : ""}</span>
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>
          {expanded ? "Hide" : operations.length ? "View" : "Status"}
        </button>
      </div>
      {expanded && <div className="offline-sync__panel">
        <div className="offline-sync__panel-heading"><strong>Saved on this device</strong><button type="button" disabled={!online || syncing || pendingCount === 0} onClick={() => void sync()}><RefreshCw size={13} /> Sync now</button></div>
        {!operations.length ? <p>No offline actions are waiting to sync.</p> : <ul>
          {operations.map((operation) => <li key={operation.id}>
            <div><strong>{operationTitle(operation.path)}</strong><small>{new Date(operation.createdAt).toLocaleString()} · {operation.status === "review" ? operation.message ?? "Needs review" : operation.status === "syncing" ? "Syncing now" : "Waiting to sync"}</small></div>
            <button type="button" aria-label={`Remove saved ${operationTitle(operation.path)}`} onClick={() => void removeOperation(operation.id)}><Trash2 size={15} /></button>
          </li>)}
        </ul>}
        <p className="offline-sync__footnote">This app syncs while it is open, every 10 seconds and when your connection returns. Items needing review are not retried automatically.</p>
      </div>}
    </section>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider.");
  return context;
}
