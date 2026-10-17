import { CalendarCheck, ClipboardList, LayoutDashboard, Package, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppRole } from "../lib/api";
import type { DashboardSection } from "./DashboardSidebar";
import "../css/MobileNav.css";

const items: Record<DashboardSection, { shortLabel: string; icon: LucideIcon }> = {
  Overview: { shortLabel: "Home", icon: LayoutDashboard },
  "Department Hub": { shortLabel: "Team", icon: UsersRound },
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
  super_admin: ["Overview", "Staff", "Inventory", "Sales", "Reports", "Stock Movement"],
  management_admin: ["Overview", "Staff", "Inventory", "Sales", "Reports", "Stock Movement"],
  department_supervisor: ["Overview", "Staff", "Attendance", "Sales", "Cash Management", "Stock Movement"],
  inventory_officer: ["Overview", "Inventory", "Stock Movement", "Tasks", "Profile"],
  cash_sales_officer: ["Overview", "Sales", "Cash Management", "Stock Movement", "Reports"],
  staff: ["Overview", "Attendance", "Sales", "Cash Management", "Stock Movement", "Chat", "Profile"],
};

export default function MobileNav({
  role,
  activeSection,
  onNavigate,
  salesEnabled,
  isDepartmentHead,
}: {
  role: AppRole;
  activeSection: DashboardSection;
  onNavigate: (section: DashboardSection) => void;
  salesEnabled: boolean;
  isDepartmentHead: boolean;
}) {
  const canBrowseAllSales = role === "super_admin" || role === "management_admin";
  const sections = [
    ...mobileSectionsByRole[role],
    ...(isDepartmentHead ? ["Department Hub" as const] : []),
  ]
    .filter((section) => section !== "Sales" || canBrowseAllSales || salesEnabled);
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
