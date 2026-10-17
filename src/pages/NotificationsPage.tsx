import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CircleCheck } from "lucide-react";
import type { CurrentUser } from "../lib/api";
import { apiRequest } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import PageHeading from "../components/PageHeading";
import "./../css/OperationsPages.css";

interface SaleNotification {
  id: string;
  type: "sale";
  title: string;
  detail: string;
  saleId: string;
  createdAt: string;
  readAt: string | null;
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

export default function NotificationsPage({ user }: { user: CurrentUser }) {
  const isAdmin = user.role === "super_admin" || user.role === "management_admin";
  const { showToast } = useToast();
  const [filter, setFilter] = useState("All");
  const [notifications, setNotifications] = useState<SaleNotification[]>([]);
  const [loading, setLoading] = useState(isAdmin);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const result = await apiRequest<{ notifications: SaleNotification[] }>("/api/v1/sales/notifications");
      setNotifications(result.notifications);
      setError("");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't load notifications.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadNotifications();
    const onNewNotification = () => { void loadNotifications(); };
    window.addEventListener("flexbar:notification", onNewNotification);
    return () => window.removeEventListener("flexbar:notification", onNewNotification);
  }, [isAdmin, loadNotifications]);

  const visibleNotifications = useMemo(
    () => filter === "All" || filter === "Sales" ? notifications : [],
    [filter, notifications],
  );
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  async function markAllRead() {
    setSaving(true);
    try {
      await apiRequest("/api/v1/sales/notifications/read", { method: "PATCH" });
      setNotifications((current) => current.map((notification) => ({ ...notification, readAt: new Date().toISOString() })));
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't update your notifications.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="module-page">
      <PageHeading title="Notifications" description={isAdmin ? "Real-time updates about completed sales and operations." : "Important updates about work and operations."} />
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {isAdmin ? <>
        <div className="surface-card notification-summary">
          <div className="surface-card__heading"><div><h2>Sales activity</h2><p>Completed sales from every active department</p></div><span className="status-pill status-pill--neutral">{unreadCount} unread</span></div>
          <div className="tab-strip">{["All", "Sales"].map((tab) => <button className={`tab-chip${filter === tab ? " tab-chip--active" : ""}`} key={tab} type="button" onClick={() => setFilter(tab)}>{tab}</button>)}</div>
          {unreadCount > 0 && <button className="icon-link notification-read-button" type="button" disabled={saving} onClick={() => void markAllRead()}><CircleCheck size={15} />{saving ? "Updating…" : "Mark all as read"}</button>}
        </div>
        <div className="surface-card record-list">
          {loading ? <p className="empty-state">Loading notifications…</p> : visibleNotifications.map((item) => <div className={`record-row${item.readAt ? "" : " notification-row--unread"}`} key={item.id}>
            <span className="task-icon task-icon--green"><Bell size={17} /></span>
            <span className="record-row__main"><strong>{item.title}</strong><small>Sales · {item.detail}</small></span>
            <span className="record-row__meta">{relativeTime(item.createdAt)}</span>
            {!item.readAt && <span className="notification-indicator" aria-label="Unread" />}
          </div>)}
          {!loading && visibleNotifications.length === 0 && <p className="empty-state">No completed sales to notify you about yet.</p>}
        </div>
      </> : <div className="surface-card feature-unavailable" role="status">
        <span className="task-icon task-icon--blue"><Bell size={18} /></span>
        <div><h2>No staff notifications are connected</h2><p>Notifications for tasks and messages will appear here when those live modules are enabled. Completed-sale notifications are currently delivered to administrators.</p></div>
      </div>}
    </section>
  );
}
