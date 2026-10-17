import { Suspense, lazy, useEffect, useState } from "react";
import {
  Activity,
  CalendarCheck,
  ChartNoAxesCombined,
  ClipboardList,
  LockKeyhole,
  MessageSquare,
  Package,
  ShieldCheck,
  UsersRound,
  Wine,
} from "lucide-react";
import type { CurrentUser } from "../lib/api";
import { apiRequest } from "../lib/api";
import { supabase } from "../lib/supabase";
import { getNotificationSection } from "../lib/notifications";
import { roleLabel } from "../lib/roles";
import DashboardHeader from "../components/DashboardHeader";
import DashboardSidebar from "../components/DashboardSidebar";
import type { DashboardSection } from "../components/DashboardSidebar";
import MobileNav from "../components/MobileNav";
import ModuleCard from "../components/ModuleCard";
import AttendancePage from "./AttendancePage";
import CashManagementPage from "./CashManagementPage";
import ChatPage from "./ChatPage";
import DepartmentsPage from "./DepartmentsPage";
import InventoryPage from "./InventoryPage";
import MeetingRoomPage from "./MeetingRoomPage";
import NotificationsPage from "./NotificationsPage";
import ProfilePage from "./ProfilePage";
import ReportsPage from "./ReportsPage";
import SalesPage from "./SalesPage";
import SettingsPage from "./SettingsPage";
import StaffPage from "./StaffPage";
import StockMovementPage from "./StockMovementPage";
import StaffHomePage from "./StaffHomePage";
import DepartmentHubPage from "./DepartmentHubPage";
import TasksPage from "./TasksPage";
import "../css/DashboardPage.css";

const AdminUsersPage = lazy(() => import("./AdminUsersPage"));

const modules = [
  { section: "Staff", title: "Staff & departments", description: "People and team structure", accent: "blue", icon: UsersRound },
  { section: "Attendance", title: "Attendance", description: "Clock-in and attendance records", accent: "green", icon: CalendarCheck },
  { section: "Inventory", title: "Inventory", description: "Products and stock movement", accent: "amber", icon: Package },
  { section: "Sales", title: "Sales & cash", description: "Daily sales and reconciliation", accent: "violet", icon: ChartNoAxesCombined },
  { section: "Tasks", title: "Tasks", description: "Assignments and due dates", accent: "teal", icon: ClipboardList },
  { section: "Meeting Room", title: "Communication", description: "Announcements and team updates", accent: "rose", icon: MessageSquare },
] as const;

const savedSections: DashboardSection[] = [
  "Overview",
  "Department Hub",
  "Staff",
  "Attendance",
  "Departments",
  "Inventory",
  "Stock Movement",
  "Sales",
  "Cash Management",
  "Tasks",
  "Meeting Room",
  "Chat",
  "Reports",
  "Notifications",
  "Profile",
  "Settings",
];

function readLastSection(userId: string, role: CurrentUser["role"]): { section: DashboardSection; error: string } {
  try {
    const saved = window.localStorage.getItem(`flexbar:last-section:${userId}`);
    const availableSections = role === "super_admin"
      ? savedSections
      : savedSections.filter((section) => section !== "Settings");
    return {
      section: availableSections.find((section) => section === saved) ?? "Overview",
      error: "",
    };
  } catch {
    return { section: "Overview", error: "Your last screen could not be restored in this browser." };
  }
}

export default function DashboardPage({
  user,
  onSignOut,
  onRequestPasswordReset,
  onUserUpdated,
}: {
  user: CurrentUser;
  onSignOut: () => void;
  onRequestPasswordReset: (email: string) => Promise<void>;
  onUserUpdated: (user: CurrentUser) => void;
}) {
  const [restoration] = useState(() => readLastSection(user.id, user.role));
  const [activeSection, setActiveSection] = useState<DashboardSection>(restoration.section);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [actionError, setActionError] = useState(restoration.error);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [isDepartmentHead, setIsDepartmentHead] = useState(false);
  const [departmentAccessLoaded, setDepartmentAccessLoaded] = useState(false);
  const name = user.displayName?.trim() || user.email?.split("@")[0] || "Flex Bar user";
  const firstName = (user.displayName?.trim() || user.email?.split("@")[0] || "there").split(/\s+/)[0];
  const firstNameLabel = firstName.charAt(0).toLocaleUpperCase() + firstName.slice(1);
  const localHour = new Date().getHours();
  const greeting = localHour < 12 ? "Good morning" : localHour < 17 ? "Good afternoon" : "Good evening";

  function navigate(section: DashboardSection) {
    setActiveSection(section);
    setSidebarOpen(false);
    setActionError("");
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(`flexbar:last-section:${user.id}`, activeSection);
    } catch {
      setActionError("Your current screen could not be saved for your next visit.");
    }
  }, [activeSection, user.id]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handleWorkerMessage = (event: MessageEvent<{ type?: string; notificationId?: unknown; notificationType?: unknown }>) => {
      if (event.data?.type !== "flexbar:open-notification") return;
      const notificationId = typeof event.data.notificationId === "string" ? event.data.notificationId : null;
      const notificationType = typeof event.data.notificationType === "string" ? event.data.notificationType : "unknown";
      setActiveSection(getNotificationSection(notificationType));
      setSidebarOpen(false);
      setActionError("");
      if (notificationId) {
        void apiRequest(`/api/v1/sales/notifications/${notificationId}/read`, { method: "PATCH" })
          .then(() => setUnreadNotifications((count) => Math.max(0, count - 1)))
          .catch((error: unknown) => console.error("Could not mark the device notification as read.", error));
      }
    };
    navigator.serviceWorker.addEventListener("message", handleWorkerMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleWorkerMessage);
  }, []);

  useEffect(() => {
    let active = true;
    void apiRequest<{ isDepartmentHead: boolean }>("/api/v1/department/access")
      .then((access) => {
        if (active) {
          setIsDepartmentHead(access.isDepartmentHead);
          setDepartmentAccessLoaded(true);
        }
      })
      .catch((error: unknown) => {
        console.error("Could not load department head access.", error);
        if (active) setDepartmentAccessLoaded(true);
      });
    return () => { active = false; };
  }, [user.id]);

  useEffect(() => {
    if (departmentAccessLoaded && !isDepartmentHead && activeSection === "Department Hub") {
      navigate("Overview");
    }
  }, [activeSection, departmentAccessLoaded, isDepartmentHead]);

  useEffect(() => {
    const realtimeClient = supabase;
    if (!realtimeClient) return;
    let active = true;
    const refreshUnreadCount = async () => {
      try {
        const result = await apiRequest<{ unreadCount: number }>("/api/v1/sales/notifications");
        if (active) setUnreadNotifications(result.unreadCount);
      } catch (error: unknown) {
        if (active) console.error("Could not refresh notifications.", error);
      }
    };
    void refreshUnreadCount();
    const channel = realtimeClient
      .channel(`admin-sales-notifications-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        window.dispatchEvent(new Event("flexbar:notification"));
        if ("Notification" in window && Notification.permission === "granted") {
          const row = payload.new as { id?: unknown; type?: unknown; title?: unknown; detail?: unknown };
          const notificationType = typeof row.type === "string" ? row.type : "unknown";
          const title = typeof row.title === "string" ? row.title : "Flex Bar notification";
          const body = typeof row.detail === "string" ? row.detail : "You have a new workspace update.";
          const tag = typeof row.id === "string" ? `flexbar-notification-${row.id}` : undefined;
          void (async () => {
            try {
              const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
              if (registration) {
                await registration.showNotification(title, {
                  body,
                  icon: "/flexbar-icon.svg",
                  tag,
                  data: { url: "/", notificationId: row.id, notificationType },
                });
              } else {
                new Notification(title, { body, icon: "/flexbar-icon.svg", tag });
              }
            } catch (error: unknown) {
              console.error("Could not show a device notification.", error);
            }
          })();
        }
        void refreshUnreadCount();
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Could not subscribe to real-time notifications.", status);
        }
      });
    return () => {
      active = false;
      void realtimeClient.removeChannel(channel);
    };
  }, [user.id]);

  function renderSection() {
    switch (activeSection) {
      case "Department Hub": return <DepartmentHubPage />;
      case "Staff": return user.role === "super_admin" || user.role === "management_admin" ? <Suspense fallback={<div className="admin-empty">Loading user management…</div>}><AdminUsersPage /></Suspense> : <StaffPage user={user} onNavigate={navigate} />;
      case "Attendance": return <AttendancePage canClockIn={user.role !== "super_admin"} />;
      case "Departments": return <DepartmentsPage canManage={user.role === "super_admin" || user.role === "management_admin"} />;
      case "Inventory": return <InventoryPage user={user} onMovements={() => navigate("Stock Movement")} />;
      case "Stock Movement": return <StockMovementPage userId={user.id} onBack={() => navigate(user.role === "inventory_officer" || user.role === "management_admin" || user.role === "super_admin" ? "Inventory" : "Overview")} />;
      case "Sales": return <SalesPage user={user} />;
      case "Cash Management": return <CashManagementPage user={user} />;
      case "Tasks": return <TasksPage />;
      case "Meeting Room": return <MeetingRoomPage user={user} />;
      case "Chat": return <ChatPage user={user} />;
      case "Reports": return <ReportsPage user={user} />;
      case "Notifications": return <NotificationsPage onOpenSection={navigate} />;
      case "Profile":
        return (
          <ProfilePage
            user={user}
            onRequestPasswordReset={onRequestPasswordReset}
            onUserUpdated={onUserUpdated}
            onNavigate={navigate}
          />
        );
      case "Settings": return <SettingsPage canManage={user.role === "super_admin" || user.role === "management_admin"} onManageUsers={() => navigate("Staff")} />;
      case "Overview": return null;
    }
  }

  return (
    <div className="app-shell">
      <DashboardSidebar
        activeSection={activeSection}
        role={user.role}
        salesEnabled={user.salesEnabled}
        isDepartmentHead={isDepartmentHead}
        open={sidebarOpen}
        onNavigate={navigate}
        onClose={() => setSidebarOpen(false)}
        onSignOut={onSignOut}
      />
      <div className="workspace">
        <DashboardHeader
          section={activeSection}
          companyName={user.companyName}
          name={name}
          role={roleLabel(user.role)}
          avatarPath={user.avatarPath}
          onToggleMenu={() => setSidebarOpen((open) => !open)}
          onNotifications={() => navigate("Notifications")}
          onProfile={() => navigate("Profile")}
          unreadNotifications={unreadNotifications}
        />
        <main className="dashboard-content">
          {actionError && <div className="alert alert--error dashboard-alert" role="alert">{actionError}</div>}
          {activeSection === "Overview" && user.role === "staff" ? (
            <StaffHomePage name={firstName} userId={user.id} salesEnabled={user.salesEnabled} onNavigate={navigate} />
          ) : activeSection === "Overview" ? (
            <>
              <div className="page-heading">
                <div><p className="eyebrow">FLEX BAR · OPERATIONS</p><h1>{greeting}, {firstNameLabel}.</h1><p>Here’s your workspace at a glance.</p></div>
                <div className="date-chip"><CalendarCheck size={16} />{new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date())}</div>
              </div>
              <section className="welcome-banner">
                <div className="welcome-banner__content">
                  <span className="welcome-banner__overline">YOUR WORKSPACE</span>
                  <h2>Welcome to {user.companyName}</h2>
                  <p>Your people and daily operations, together in one place.</p>
                  <span className="welcome-banner__role"><ShieldCheck size={14} />{roleLabel(user.role)}</span>
                </div>
                <div className="welcome-banner__art" aria-hidden="true"><Wine size={102} strokeWidth={1} /></div>
              </section>
              <div className="section-heading">
                <div><h2>Operations overview</h2><p>Quick access to your team and daily workflows.</p></div>
                <span className="section-heading__period"><Activity size={15} /> TODAY</span>
              </div>
              <section className="module-grid" aria-label="Operations modules">
                {modules.map((module) => (
                  <ModuleCard key={module.section} title={module.title} description={module.description} accent={module.accent} icon={module.icon} onClick={() => navigate(module.section)} />
                ))}
              </section>
            </>
          ) : renderSection()}
          <footer className="dashboard-footer">
            <span>Flex Bar · Staff &amp; Business Management</span>
            <span><LockKeyhole size={13} /> Secure workspace</span>
          </footer>
        </main>
      </div>
      <MobileNav role={user.role} salesEnabled={user.salesEnabled} isDepartmentHead={isDepartmentHead} activeSection={activeSection} onNavigate={navigate} />
    </div>
  );
}
