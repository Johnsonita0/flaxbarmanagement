import { CalendarCheck, ClipboardList, LayoutDashboard, Package, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppRole } from "../lib/api";
import type { DashboardSection } from "./DashboardSidebar";
import "../css/MobileNav.css";

const items: Record<DashboardSection, { shortLabel: string; icon: LucideIcon }> = {
  Overview: { shortLabel: "Home", icon: LayoutDashboard },
  Staff: { shortLabel: "Staff", icon: UsersRound },
  Attendance: { shortLabel: "Attend", icon: CalendarCheck },
  Departments: { shortLabel: "Teams", icon: UsersRound },
  Inventory: { shortLabel: "Ops", icon: Package },
  "Stock Movement": { shortLabel: "Stock", icon: Package },
  Sales: { shortLabel: "Sales", icon: CalendarCheck },
  "Cash Management": { shortLabel: "Cash", icon: CalendarCheck },
  Tasks: { shortLabel: "Tasks", icon: ClipboardList },
  "Meeting Room": { shortLabel: "Meet", icon: CalendarCheck },
  Chat: { shortLabel: "Chat", icon: CalendarCheck },
  Reports: { shortLabel: "Reports", icon: CalendarCheck },
  Notifications: { shortLabel: "Alerts", icon: CalendarCheck },
  Profile: { shortLabel: "Profile", icon: UsersRound },
  Settings: { shortLabel: "Settings", icon: CalendarCheck },
};

const mobileSectionsByRole: Record<AppRole, DashboardSection[]> = {
  super_admin: ["Overview", "Staff", "Inventory", "Tasks", "Reports"],
  management_admin: ["Overview", "Staff", "Inventory", "Tasks", "Reports"],
  department_supervisor: ["Overview", "Staff", "Attendance", "Tasks", "Reports"],
  inventory_officer: ["Overview", "Inventory", "Stock Movement", "Tasks", "Profile"],
  cash_sales_officer: ["Overview", "Sales", "Cash Management", "Tasks", "Reports"],
  staff: ["Overview", "Attendance", "Tasks", "Chat", "Profile"],
};

export default function MobileNav({
  role,
  activeSection,
  onNavigate,
}: {
  role: AppRole;
  activeSection: DashboardSection;
  onNavigate: (section: DashboardSection) => void;
}) {
  const sections = mobileSectionsByRole[role];
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {sections.map((label) => {
        const { shortLabel, icon: Icon } = items[label];
        return (
          <button
            key={label}
            className={`mobile-nav__item${activeSection === label || (label === "Inventory" && activeSection === "Stock Movement") ? " mobile-nav__item--active" : ""}`}
            aria-current={activeSection === label ? "page" : undefined}
            onClick={() => onNavigate(label)}
          >
            <Icon size={19} strokeWidth={1.9} />
            <span>{shortLabel}</span>
          </button>
        );
      })}
    </nav>
  );
}
