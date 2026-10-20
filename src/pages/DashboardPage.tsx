import { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  Activity,
  Bell,
  CalendarCheck,
  ChartNoAxesCombined,
  ClipboardList,
  Download,
  LockKeyhole,
  MessageSquare,
  Package,
  ShieldCheck,
  UsersRound,
  Wine,
  X,
} from "lucide-react";
import type { CurrentUser } from "../lib/api";
import { apiRequest } from "../lib/api";
import { supabase } from "../lib/supabase";
import { getNotificationSection } from "../lib/notifications";
import { clearDeferredInstallPrompt, getDeferredInstallPrompt, type BeforeInstallPromptEvent } from "../lib/pwa";
import { roleLabel } from "../lib/roles";
import DashboardHeader from "../components/DashboardHeader";
import DashboardSidebar from "../components/DashboardSidebar";
import { PageNavigationContext } from "../components/PageNavigationContext";
import { useToast } from "../components/ToastProvider";
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
import { useInAppCalls } from "../components/InAppCalls";
import "../css/DashboardPage.css";

const AdminUsersPage = lazy(() => import("./AdminUsersPage"));

function hasDismissedInstallPrompt(userId: string) {
  try {
    return window.sessionStorage.getItem(`flexbar:install-prompt-dismissed:${userId}`) === "true";
  } catch {
    return false;
  }
}

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

function readLastSection(userId: string): { section: DashboardSection; error: string } {
  try {
    const saved = window.localStorage.getItem(`flexbar:last-section:${userId}`);
    const availableSections = savedSections;
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
  const { endActiveCall } = useInAppCalls();
  const { showToast } = useToast();
  const [restoration] = useState(() => readLastSection(user.id));
  const [activeSection, setActiveSection] = useState<DashboardSection>(restoration.section);
  const activeSectionRef = useRef(activeSection);
  const sectionHistory = useRef<DashboardSection[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [actionError, setActionError] = useState(restoration.error);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [deviceNotificationPermission, setDeviceNotificationPermission] = useState<NotificationPermission | null>(
    () => "Notification" in window ? Notification.permission : null,
  );
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(() => getDeferredInstallPrompt());
  const [installHelp, setInstallHelp] = useState("");
  const [installPromptDismissed, setInstallPromptDismissed] = useState(() => hasDismissedInstallPrompt(user.id));
  const [pwaInstalled, setPwaInstalled] = useState(() =>
    window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && navigator.standalone === true),
  );
  const [isDepartmentHead, setIsDepartmentHead] = useState(false);
  const [departmentAccessLoaded, setDepartmentAccessLoaded] = useState(false);
  const name = user.displayName?.trim() || user.email?.split("@")[0] || "Flex Bar user";
  const isAndroid = /android/i.test(navigator.userAgent);
  const pushNotificationsSupported = window.isSecureContext
    && "Notification" in window
    && "PushManager" in window
    && "serviceWorker" in navigator;
  const firstName = (user.displayName?.trim() || user.email?.split("@")[0] || "there").split(/\s+/)[0];
  const firstNameLabel = firstName.charAt(0).toLocaleUpperCase() + firstName.slice(1);
  const localHour = new Date().getHours();
  const greeting = localHour < 12 ? "Good morning" : localHour < 17 ? "Good afternoon" : "Good evening";

  function navigate(section: DashboardSection) {
    if (section !== activeSectionRef.current) sectionHistory.current.push(activeSectionRef.current);
    activeSectionRef.current = section;
    setActiveSection(section);
    setSidebarOpen(false);
    setActionError("");
  }

  function goBack() {
    const previousSection = sectionHistory.current.pop() ?? "Overview";
    activeSectionRef.current = previousSection;
    setActiveSection(previousSection);
    setSidebarOpen(false);
    setActionError("");
  }

  async function installPwa() {
    if (!installPrompt) {
      const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent);
      setInstallHelp(isAppleMobile
        ? "Tap Share in Safari, then choose Add to Home Screen."
        : "Open your browser menu and choose Install app or Add to Home Screen.");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    clearDeferredInstallPrompt();
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setInstallHelp("Flex Bar is being installed.");
  }

  async function requestDeviceNotificationPermission() {
    try {
      const permission = await Notification.requestPermission();
      setDeviceNotificationPermission(permission);
      navigate("Notifications");
    } catch (error: unknown) {
      console.error("Could not request device notification permission.", error);
      setActionError("Your browser could not request notification permission. Try enabling it in browser settings.");
    }
  }

  function dismissInstallPrompt() {
    try {
      window.sessionStorage.setItem(`flexbar:install-prompt-dismissed:${user.id}`, "true");
    } catch {
      setActionError("This browser could not remember that the install prompt was closed.");
    }
    setInstallPromptDismissed(true);
  }

  async function signOutAfterEndingCall() {
    try {
      await endActiveCall();
      await onSignOut();
    } catch (error: unknown) {
      console.error("Could not end the call before signing out.", error);
      showToast(error instanceof Error ? error.message : "End the active call before signing out.", "error");
    }
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(`flexbar:last-section:${user.id}`, activeSection);
    } catch {
      setActionError("Your current screen could not be saved for your next visit.");
    }
  }, [activeSection, user.id]);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateInstalledState = () => setPwaInstalled(
      displayMode.matches || ("standalone" in navigator && navigator.standalone === true),
    );
    const handleInstallAvailable = () => setInstallPrompt(getDeferredInstallPrompt());
    const handleAppInstalled = () => {
      setPwaInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("flexbar:install-available", handleInstallAvailable);
    window.addEventListener("appinstalled", handleAppInstalled);
    displayMode.addEventListener("change", updateInstalledState);
    return () => {
      window.removeEventListener("flexbar:install-available", handleInstallAvailable);
      window.removeEventListener("appinstalled", handleAppInstalled);
      displayMode.removeEventListener("change", updateInstalledState);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const launchUrl = new URL(window.location.href);
    const launchNotificationId = launchUrl.searchParams.get("notificationId");
    if (launchNotificationId) {
      const launchNotificationType = launchUrl.searchParams.get("notificationType") ?? "unknown";
      navigate(getNotificationSection(launchNotificationType));
      void apiRequest(`/api/v1/sales/notifications/${launchNotificationId}/read`, { method: "PATCH" })
        .then(() => window.dispatchEvent(new Event("flexbar:notification-read")))
        .catch((error: unknown) => console.error("Could not mark the opened notification as read.", error));
      launchUrl.searchParams.delete("notificationId");
      launchUrl.searchParams.delete("notificationType");
      window.history.replaceState(null, "", `${launchUrl.pathname}${launchUrl.search}${launchUrl.hash}`);
    }
    const handleWorkerMessage = (event: MessageEvent<{ type?: string; notificationId?: unknown; notificationType?: unknown }>) => {
      if (event.data?.type !== "flexbar:open-notification") return;
      const notificationId = typeof event.data.notificationId === "string" ? event.data.notificationId : null;
      const notificationType = typeof event.data.notificationType === "string" ? event.data.notificationType : "unknown";
      navigate(getNotificationSection(notificationType));
      if (notificationId) {
        void apiRequest(`/api/v1/sales/notifications/${notificationId}/read`, { method: "PATCH" })
          .then(() => window.dispatchEvent(new Event("flexbar:notification-read")))
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
      sectionHistory.current.length = 0;
      activeSectionRef.current = "Overview";
      setActiveSection("Overview");
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
    const onNotificationRead = () => { void refreshUnreadCount(); };
    window.addEventListener("flexbar:notification-read", onNotificationRead);
    const channel = realtimeClient
      .channel(`admin-sales-notifications-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        window.dispatchEvent(new Event("flexbar:notification"));
        const row = payload.new as { id?: unknown; type?: unknown; title?: unknown; detail?: unknown };
        const notificationType = typeof row.type === "string" ? row.type : "unknown";
        window.dispatchEvent(new CustomEvent("flexbar:notification-sound", {
          detail: { notificationId: row.id, notificationType },
        }));
        if ("Notification" in window && Notification.permission === "granted") {
          const title = typeof row.title === "string" ? row.title : "Flex Bar notification";
          const body = typeof row.detail === "string" ? row.detail : "You have a new workspace update.";
          const tag = typeof row.id === "string" ? `flexbar-notification-${row.id}` : undefined;
          void (async () => {
            try {
              const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
              const pushSubscription = await registration?.pushManager.getSubscription();
              if (pushSubscription) return;
              if (registration) {
                await registration.showNotification(title, {
                  body,
                  icon: "/icons/flexbar-192.png",
                  tag,
                  data: { url: "/", notificationId: row.id, notificationType },
                });
              } else {
                new Notification(title, { body, icon: "/icons/flexbar-192.png", tag });
              }
            } catch (error: unknown) {
              console.error("Could not show a device notification.", error);
            }
          })();
        }
        void refreshUnreadCount();
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => {
        void refreshUnreadCount();
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Could not subscribe to real-time notifications.", status);
        }
      });
    return () => {
      active = false;
      window.removeEventListener("flexbar:notification-read", onNotificationRead);
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
      case "Notifications": return <NotificationsPage isAdministrator={user.role === "super_admin" || user.role === "management_admin"} onOpenSection={navigate} />;
      case "Profile":
        return (
          <ProfilePage
            user={user}
            onRequestPasswordReset={onRequestPasswordReset}
            onUserUpdated={onUserUpdated}
            onNavigate={navigate}
          />
        );
      case "Settings": return <SettingsPage userId={user.id} canManage={user.role === "super_admin" || user.role === "management_admin"} onManageUsers={() => navigate("Staff")} />;
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
        onSignOut={() => void signOutAfterEndingCall()}
      />
      <div className="workspace">
        {pushNotificationsSupported && deviceNotificationPermission === "default" && <aside className="pwa-install-prompt" aria-label="Enable push notifications">
          <span className="pwa-install-prompt__icon"><Bell size={17} /></span>
          <div className="pwa-install-prompt__copy">
            <strong>Enable notifications</strong>
            <span>Allow browser alerts, enable Incoming call alerts in Notifications, and choose call/message tones in Settings.</span>
          </div>
          <button type="button" onClick={() => void requestDeviceNotificationPermission()}>
            Allow
          </button>
        </aside>}
        {!pwaInstalled && !installPromptDismissed && <aside className="pwa-install-prompt" aria-label="Install Flex Bar">
          <span className="pwa-install-prompt__icon"><Download size={17} /></span>
          <div className="pwa-install-prompt__copy">
            <strong>Install Flex Bar</strong>
            <span>{installHelp || (isAndroid && !installPrompt
              ? "Waiting for your browser's native install option."
              : "Add Flex Bar to your device for quick access and call alerts.")}</span>
          </div>
          <button type="button" disabled={isAndroid && !installPrompt} onClick={() => void installPwa()}>
            Install
          </button>
          <button className="pwa-install-prompt__close" type="button" onClick={dismissInstallPrompt} aria-label="Close install prompt" title="Close install prompt">
            <X size={16} />
          </button>
        </aside>}
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
          <PageNavigationContext.Provider value={goBack}>
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
          </PageNavigationContext.Provider>
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
