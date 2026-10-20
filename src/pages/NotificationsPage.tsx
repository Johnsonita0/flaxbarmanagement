import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CircleCheck, MapPin } from "lucide-react";
import { apiRequest } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import { getNotificationSection } from "../lib/notifications";
import type { DashboardSection } from "../components/DashboardSidebar";
import PageHeading from "../components/PageHeading";
import "./../css/OperationsPages.css";

interface WorkspaceNotification {
  id: string;
  type: string;
  title: string;
  detail: string;
  saleId: string | null;
  createdAt: string;
  readAt: string | null;
}

interface CallPushConfig {
  enabled: boolean;
  publicKey: string | null;
  subscribed: boolean;
  configurationError?: string | null;
}

function getApplicationServerKey(value: string) {
  if (!/^[A-Za-z0-9_-]{87}$/.test(value)) {
    throw new Error("Call alerts are misconfigured. Please contact your administrator.");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const key = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  if (key.length !== 65 || key[0] !== 4) {
    throw new Error("Call alerts are misconfigured. Please contact your administrator.");
  }
  return key;
}

function sameApplicationServerKey(subscription: PushSubscription, expected: Uint8Array) {
  const current = subscription.options.applicationServerKey;
  if (!current || current.byteLength !== expected.byteLength) return false;
  const currentBytes = new Uint8Array(current);
  return expected.every((byte, index) => byte === currentBytes[index]);
}

function notificationCategory(type: string) {
  return type.split(/[_\s-]+/).filter(Boolean).map((part) => part[0].toLocaleUpperCase() + part.slice(1)).join(" ") || "Updates";
}

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export default function NotificationsPage({
  isAdministrator,
  onOpenSection,
}: {
  isAdministrator: boolean;
  onOpenSection: (section: DashboardSection) => void;
}) {
  const { showToast } = useToast();
  const [filter, setFilter] = useState("All");
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingNotificationId, setOpeningNotificationId] = useState<string | null>(null);
  const [expandedNotificationId, setExpandedNotificationId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [callPushConfig, setCallPushConfig] = useState<CallPushConfig | null>(null);
  const [callPushError, setCallPushError] = useState("");
  const [callPushSaving, setCallPushSaving] = useState(false);
  const callPushSupported = typeof window !== "undefined"
    && window.isSecureContext
    && "Notification" in window
    && "PushManager" in window
    && "serviceWorker" in navigator;
  const [devicePermission, setDevicePermission] = useState<NotificationPermission | null>(
    () => typeof window !== "undefined" && "Notification" in window ? Notification.permission : null,
  );

  const loadNotifications = useCallback(async () => {
    try {
      const result = await apiRequest<{ notifications: WorkspaceNotification[]; unreadCount: number }>("/api/v1/sales/notifications");
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      setError("");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const onNewNotification = () => { void loadNotifications(); };
    window.addEventListener("flexbar:notification", onNewNotification);
    return () => window.removeEventListener("flexbar:notification", onNewNotification);
  }, [loadNotifications]);

  useEffect(() => {
    if (!callPushSupported) return;
    let active = true;
    void apiRequest<CallPushConfig>("/api/v1/call-push/config")
      .then((config) => { if (active) setCallPushConfig(config); })
      .catch((reason: unknown) => {
        if (active) {
          setCallPushError(reason instanceof Error ? reason.message : "Call alert settings could not be loaded.");
        }
      });
    return () => { active = false; };
  }, [callPushSupported, showToast]);

  const categories = useMemo(
    () => [...new Set(notifications
      .filter((notification) => !["system_error", "attendance_geofence_violation"].includes(notification.type))
      .map((notification) => notificationCategory(notification.type)))].sort(),
    [notifications],
  );
  const filters = ["All", ...(isAdministrator ? ["System errors", "Geofencing"] : []), ...categories];
  const visibleNotifications = notifications.filter((notification) => {
    if (filter === "All") return true;
    if (filter === "System errors") return notification.type === "system_error";
    if (filter === "Geofencing") return notification.type === "attendance_geofence_violation";
    return notificationCategory(notification.type) === filter;
  });

  async function openNotification(notification: WorkspaceNotification) {
    setOpeningNotificationId(notification.id);
    try {
      if (!notification.readAt) {
        await apiRequest(`/api/v1/sales/notifications/${notification.id}/read`, { method: "PATCH" });
        setNotifications((current) => current.map((item) => item.id === notification.id
          ? { ...item, readAt: new Date().toISOString() }
          : item));
        setUnreadCount((count) => Math.max(0, count - 1));
        window.dispatchEvent(new Event("flexbar:notification-read"));
      }
      if (notification.type === "system_error" || notification.type === "attendance_geofence_violation") {
        setExpandedNotificationId((current) => current === notification.id ? null : notification.id);
        return;
      }
      onOpenSection(getNotificationSection(notification.type));
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't open this notification.", "error");
    } finally {
      setOpeningNotificationId(null);
    }
  }

  async function enableDeviceNotifications() {
    if (!("Notification" in window)) return;
    try {
      const permission = await Notification.requestPermission();
      setDevicePermission(permission);
      if (permission === "granted") {
        showToast("Device notifications are enabled for new workspace updates.", "success");
      }
    } catch (reason: unknown) {
      console.error("Could not request device notification permission.", reason);
      showToast("Your browser could not enable device notifications.", "error");
    }
  }

  async function toggleCallAlerts() {
    if (!callPushConfig) return;
    setCallPushSaving(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      const applicationServerKey = callPushConfig.enabled && callPushConfig.publicKey
        ? getApplicationServerKey(callPushConfig.publicKey)
        : null;
      if (
        callPushConfig.subscribed &&
        subscription &&
        applicationServerKey &&
        sameApplicationServerKey(subscription, applicationServerKey)
      ) {
        await apiRequest("/api/v1/call-push/subscription", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
        setCallPushConfig({ ...callPushConfig, subscribed: false });
        showToast("Incoming call alerts are disabled on this device.", "success");
        return;
      }

      if (!callPushConfig.enabled || !callPushConfig.publicKey) {
        throw new Error(callPushConfig.configurationError ?? "Call alerts are not configured yet. Please contact your administrator.");
      }
      const expectedApplicationServerKey = applicationServerKey ?? getApplicationServerKey(callPushConfig.publicKey);
      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      setDevicePermission(permission);
      if (permission !== "granted") throw new Error("Allow notifications in your browser settings to enable call alerts.");

      let activeSubscription = subscription;
      if (activeSubscription && !sameApplicationServerKey(activeSubscription, expectedApplicationServerKey)) {
        await apiRequest("/api/v1/call-push/subscription", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: activeSubscription.endpoint }),
        });
        await activeSubscription.unsubscribe();
        activeSubscription = null;
      } else if (callPushConfig.subscribed && !activeSubscription) {
        await apiRequest("/api/v1/call-push/subscription", { method: "DELETE", body: JSON.stringify({}) });
      }
      activeSubscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedApplicationServerKey,
      });
      const serialized = activeSubscription.toJSON();
      if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
        throw new Error("Your browser returned an incomplete push subscription. Please try again.");
      }
      await apiRequest("/api/v1/call-push/subscription", {
        method: "POST",
        body: JSON.stringify({ endpoint: serialized.endpoint, keys: serialized.keys }),
      });
      setCallPushConfig({ ...callPushConfig, subscribed: true });
      showToast("Incoming call alerts are enabled on this device.", "success");
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "Call alerts could not be updated.", "error");
    } finally {
      setCallPushSaving(false);
    }
  }

  async function markAllRead() {
    setSaving(true);
    try {
      await apiRequest("/api/v1/sales/notifications/read", { method: "PATCH" });
      setNotifications((current) => current.map((notification) => ({ ...notification, readAt: new Date().toISOString() })));
      setUnreadCount(0);
      window.dispatchEvent(new Event("flexbar:notification-read"));
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't update your notifications.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="module-page">
      <PageHeading title="Notification inbox" description="Workspace updates, geofence alerts, and system messages delivered to your account." />
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      <div className="surface-card notification-summary">
        <div className="surface-card__heading">
          <div><h2>All notifications</h2><p>Open an alert to read its full details.</p></div>
          <span className="status-pill status-pill--neutral">{unreadCount} unread</span>
        </div>
        <div className="notification-controls">
          <div className="tab-strip">
            {filters.map((tab) => <button className={`tab-chip${filter === tab ? " tab-chip--active" : ""}`} key={tab} type="button" onClick={() => setFilter(tab)}>{tab}</button>)}
          </div>
          <div className="notification-actions">
            {devicePermission !== null
              ? devicePermission === "granted"
                ? <span className="notification-device-status">Device alerts enabled</span>
                : devicePermission === "denied"
                  ? <span className="notification-device-status">Alerts are blocked; allow them in browser settings</span>
                  : <button className="button button--outline" type="button" onClick={() => void enableDeviceNotifications()}>Enable device alerts</button>
              : <span className="notification-device-status">Device alerts are not supported by this browser</span>}
            {unreadCount > 0 && <button className="icon-link notification-read-button" type="button" disabled={saving} onClick={() => void markAllRead()}><CircleCheck size={15} />{saving ? "Updating…" : "Mark all as read"}</button>}
          </div>
        </div>
        <div className="notification-push-setting">
          <div>
            <strong>Incoming call alerts</strong>
            <small>Get call and message alerts on this device, including while Flex Bar is closed. Enable alerts separately on each device.</small>
          </div>
          {!callPushSupported
            ? <span className="notification-device-status">{/iphone|ipad|ipod/i.test(navigator.userAgent)
              ? "On iPhone or iPad, install Flex Bar from Safari's Share menu first."
              : "Push alerts are not supported in this browser"}</span>
            : !callPushConfig
              ? <span className="notification-device-status">{callPushError || "Loading call alert settings…"}</span>
              : !callPushConfig.enabled
                ? <span className="notification-device-status">{callPushConfig.configurationError ?? "Call alerts are not configured"}</span>
                : <button className="button button--outline" type="button" disabled={callPushSaving} onClick={() => void toggleCallAlerts()}>
                  <Bell size={14} />{callPushSaving ? "Updating…" : callPushConfig.subscribed ? "Disable device alerts" : "Enable call & message alerts"}
                </button>}
        </div>
      </div>
      <div className="surface-card record-list">
        {loading ? <p className="empty-state">Loading notifications…</p> : visibleNotifications.map((item) => {
          const isSystemError = item.type === "system_error";
          const isGeofenceAlert = item.type === "attendance_geofence_violation";
          const isExpanded = expandedNotificationId === item.id;
          return <Fragment key={item.id}>
            <button
              className={`record-row record-row--button${item.readAt ? "" : " notification-row--unread"}${isSystemError || isGeofenceAlert ? " notification-row--system" : ""}`}
              type="button"
              onClick={() => void openNotification(item)}
              disabled={openingNotificationId !== null}
              aria-expanded={isSystemError || isGeofenceAlert ? isExpanded : undefined}
            >
              <span className="task-icon task-icon--green">{isSystemError ? <AlertTriangle size={17} /> : isGeofenceAlert ? <MapPin size={17} /> : <Bell size={17} />}</span>
              <span className="record-row__main">
                <strong>{item.title}</strong>
                <small>{isSystemError ? "System error" : isGeofenceAlert ? "Geofencing" : `${notificationCategory(item.type)} · ${item.detail}`}</small>
              </span>
              <span className="record-row__meta">{openingNotificationId === item.id ? "Opening…" : relativeTime(item.createdAt)}</span>
              {!item.readAt && <span className="notification-indicator" aria-label="Unread" />}
            </button>
            {isExpanded && <div className="notification-detail-panel">
              <strong>{isSystemError ? "Full system error message" : "Geofence alert details"}</strong>
              <pre>{item.detail}</pre>
            </div>}
          </Fragment>;
        })}
        {!loading && visibleNotifications.length === 0 && <p className="empty-state">{notifications.length ? "No notifications match this category." : "You don't have any notifications yet."}</p>}
      </div>
    </section>
  );
}
