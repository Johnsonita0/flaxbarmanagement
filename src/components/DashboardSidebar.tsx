import { useEffect } from "react";
import {
  Activity,
  CalendarCheck,
  ChartNoAxesCombined,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  Settings,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppRole } from "../lib/api";
import Brand from "./Brand";
import "../css/DashboardSidebar.css";

export type DashboardSection =
  | "Overview"
  | "Staff"
  | "Attendance"
  | "Departments"
  | "Inventory"
  | "Stock Movement"
  | "Sales"
  | "Cash Management"
  | "Tasks"
  | "Meeting Room"
  | "Chat"
  | "Reports"
  | "Notifications"
  | "Profile"
  | "Settings";

const navigation: { label: DashboardSection; icon: LucideIcon }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Staff", icon: UsersRound },
  { label: "Attendance", icon: CalendarCheck },
  { label: "Departments", icon: UserRound },
  { label: "Inventory", icon: Package },
  { label: "Sales", icon: ChartNoAxesCombined },
  { label: "Cash Management", icon: Wallet },
  { label: "Tasks", icon: ClipboardList },
  { label: "Meeting Room", icon: MessageSquare },
  { label: "Chat", icon: MessageSquare },
  { label: "Reports", icon: Activity },
  { label: "Notifications", icon: CalendarCheck },
  { label: "Profile", icon: UserRound },
  { label: "Settings", icon: Settings },
];

export default function DashboardSidebar({
  activeSection,
  role,
  open,
  onNavigate,
  onClose,
  onSignOut,
}: {
  activeSection: DashboardSection;
  role: AppRole;
  open: boolean;
  onNavigate: (section: DashboardSection) => void;
  onClose: () => void;
  onSignOut: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [open]);

  const sectionsByRole: Record<AppRole, DashboardSection[]> = {
    super_admin: navigation.map(({ label }) => label),
    management_admin: navigation.filter(({ label }) => label !== "Settings").map(({ label }) => label),
    department_supervisor: ["Overview", "Staff", "Attendance", "Departments", "Sales", "Tasks", "Meeting Room", "Chat", "Reports", "Notifications", "Profile"],
    inventory_officer: ["Overview", "Inventory", "Stock Movement", "Tasks", "Reports", "Notifications", "Profile"],
    cash_sales_officer: ["Overview", "Attendance", "Sales", "Cash Management", "Tasks", "Meeting Room", "Chat", "Reports", "Notifications", "Profile"],
    staff: ["Overview", "Attendance", "Tasks", "Meeting Room", "Chat", "Notifications", "Profile"],
  };
  const allowedSections = sectionsByRole[role];

  return (
    <>
      {open && <button className="sidebar-backdrop" aria-label="Close menu" onClick={onClose} />}
      <aside className={`sidebar${open ? " sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <Brand compact />
          <span className="sidebar__workspace">{role === "super_admin" ? "ADMIN WORKSPACE" : "STAFF WORKSPACE"}</span>
        </div>
        <div className="sidebar__label">WORKSPACE</div>
        <nav className="sidebar__nav" aria-label="Main navigation">
          {navigation.filter(({ label }) => allowedSections.includes(label)).map(({ label, icon: Icon }) => (
            <button
              className={`nav-item${activeSection === label || (label === "Inventory" && activeSection === "Stock Movement") ? " nav-item--active" : ""}`}
              key={label}
              onClick={() => onNavigate(label)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {activeSection === label && <span className="nav-item__active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar__bottom">
          <div className="help-card">
            <span className="help-card__icon"><span aria-hidden="true">?</span></span>
            <span><strong>Need a hand?</strong><small>Contact your administrator</small></span>
          </div>
          <button className="nav-item nav-item--logout" onClick={onSignOut}>
            <LogOut size={18} /> <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
