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
    return {
      section: savedSections.find((section) => section === saved) ?? "Overview",
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
}: {
  user: CurrentUser;
  onSignOut: () => void;
  onRequestPasswordReset: (email: string) => Promise<void>;
}) {
  const [restoration] = useState(() => readLastSection(user.id));
  const [activeSection, setActiveSection] = useState<DashboardSection>(restoration.section);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [actionError, setActionError] = useState(restoration.error);
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

  function renderSection() {
    switch (activeSection) {
      case "Staff": return user.role === "super_admin" ? <Suspense fallback={<div className="admin-empty">Loading user management…</div>}><AdminUsersPage /></Suspense> : <StaffPage onNavigate={navigate} />;
      case "Attendance": return <AttendancePage canClockIn={user.role !== "super_admin"} />;
      case "Departments": return <DepartmentsPage canManage={user.role === "super_admin"} />;
      case "Inventory": return <InventoryPage onMovements={() => navigate("Stock Movement")} />;
      case "Stock Movement": return <StockMovementPage onBack={() => navigate("Inventory")} />;
      case "Sales": return <SalesPage />;
      case "Cash Management": return <CashManagementPage />;
      case "Tasks": return <TasksPage />;
      case "Meeting Room": return <MeetingRoomPage />;
      case "Chat": return <ChatPage />;
      case "Reports": return <ReportsPage />;
      case "Notifications": return <NotificationsPage />;
      case "Profile":
        return (
          <ProfilePage
            user={user}
            onRequestPasswordReset={onRequestPasswordReset}
          />
        );
      case "Settings": return <SettingsPage canManage={user.role === "super_admin"} onManageUsers={() => navigate("Staff")} />;
      case "Overview": return null;
    }
  }

  return (
    <div className="app-shell">
      <DashboardSidebar
        activeSection={activeSection}
        role={user.role}
        open={sidebarOpen}
        onNavigate={navigate}
        onClose={() => setSidebarOpen(false)}
        onSignOut={onSignOut}
      />
      <div className="workspace">
        <DashboardHeader
          section={activeSection}
          name={name}
          role={roleLabel(user.role)}
          onToggleMenu={() => setSidebarOpen((open) => !open)}
          onNotifications={() => navigate("Notifications")}
          onProfile={() => navigate("Profile")}
        />
        <main className="dashboard-content">
          {actionError && <div className="alert alert--error dashboard-alert" role="alert">{actionError}</div>}
          {activeSection === "Overview" && user.role === "staff" ? (
            <StaffHomePage name={firstName} onNavigate={navigate} />
          ) : activeSection === "Overview" ? (
            <>
              <div className="page-heading">
                <div><p className="eyebrow">FLEX BAR · OPERATIONS</p><h1>{greeting}, {firstNameLabel}.</h1><p>Here’s your workspace at a glance.</p></div>
                <div className="date-chip"><CalendarCheck size={16} />{new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date())}</div>
              </div>
              <section className="welcome-banner">
                <div className="welcome-banner__content">
                  <span className="welcome-banner__overline">YOUR WORKSPACE</span>
                  <h2>Welcome to Flex Bar</h2>
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
              <section className="setup-banner">
                <span className="setup-banner__icon"><ShieldCheck size={17} /></span>
                <div><strong>Sample dashboard preview</strong><p>These screens follow the supplied Flex Bar UI flow. Operational records are not connected or saved yet.</p></div>
                <span className="setup-banner__status">UI PREVIEW</span>
              </section>
            </>
          ) : renderSection()}
          <footer className="dashboard-footer">
            <span>Flex Bar · Staff &amp; Business Management</span>
            <span><LockKeyhole size={13} /> Secure workspace</span>
          </footer>
        </main>
      </div>
      <MobileNav role={user.role} activeSection={activeSection} onNavigate={navigate} />
    </div>
  );
}
