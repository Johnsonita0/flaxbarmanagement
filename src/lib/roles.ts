import type { AppRole } from "./api";

const labels: Record<AppRole, string> = {
  super_admin: "Super Admin",
  management_admin: "Management",
  department_supervisor: "Supervisor",
  inventory_officer: "Inventory Officer",
  cash_sales_officer: "Cash & Sales Officer",
  staff: "Staff",
};

export function roleLabel(role: AppRole): string {
  return labels[role];
}
