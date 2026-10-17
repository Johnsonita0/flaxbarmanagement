import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CircleCheck } from "lucide-react";
import { apiRequest } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import PageHeading from "../components/PageHeading";
import "./../css/OperationsPages.css";

interface SaleNotification {
  id: string;
  type: string;
  title: string;
  detail: string;
  saleId: string | null;
  createdAt: string;
  readAt: string | null;
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

export default function NotificationsPage() {
  const { showToast } = useToast();
  const [filter, setFilter] = useState("All");
  const [notifications, setNotifications] = useState<SaleNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [devicePermission, setDevicePermission] = useState<NotificationPermission | null>(
    () => typeof window !== "undefined" && "Notification" in window ? Notification.permission : null,
  );

  const loadNotifications = useCallback(async () => {
    try {
      const result = await apiRequest<{ notifications: SaleNotification[]; unreadCount: number }>("/api/v1/sales/notifications");
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

  const categories = useMemo(
    () => [...new Set(notifications.map((notification) => notificationCategory(notification.type)))].sort(),
    [notifications],
  );
  const visibleNotifications = filter === "All"
    ? notifications
    : notifications.filter((notification) => notificationCategory(notification.type) === filter);
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

  async function markAllRead() {
    setSaving(true);
    try {
      await apiRequest("/api/v1/sales/notifications/read", { method: "PATCH" });
      setNotifications((current) => current.map((notification) => ({ ...notification, readAt: new Date().toISOString() })));
      setUnreadCount(0);
      window.dispatchEvent(new Event("flexbar:notification"));
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't update your notifications.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="module-page">
      <PageHeading title="Notifications" description="Updates sent to your account about work and operations." />
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      <div className="surface-card notification-summary">
        <div className="surface-card__heading">
          <div><h2>All notifications</h2><p>Sales and other updates delivered to your account</p></div>
          <span className="status-pill status-pill--neutral">{unreadCount} unread</span>
        </div>
        <div className="notification-controls">
          <div className="tab-strip">
            {["All", ...categories].map((tab) => <button className={`tab-chip${filter === tab ? " tab-chip--active" : ""}`} key={tab} type="button" onClick={() => setFilter(tab)}>{tab}</button>)}
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
      </div>
      <div className="surface-card record-list">
        {loading ? <p className="empty-state">Loading notifications…</p> : visibleNotifications.map((item) => <div className={`record-row${item.readAt ? "" : " notification-row--unread"}`} key={item.id}>
          <span className="task-icon task-icon--green"><Bell size={17} /></span>
          <span className="record-row__main"><strong>{item.title}</strong><small>{notificationCategory(item.type)} · {item.detail}</small></span>
          <span className="record-row__meta">{relativeTime(item.createdAt)}</span>
          {!item.readAt && <span className="notification-indicator" aria-label="Unread" />}
        </div>)}
        {!loading && visibleNotifications.length === 0 && <p className="empty-state">{notifications.length ? "No notifications match this category." : "You don't have any notifications yet."}</p>}
      </div>
    </section>
  );
}
