import type { DashboardSection } from "../components/DashboardSidebar";

const notificationDestinations: Record<string, DashboardSection> = {
  sale: "Sales",
  sales: "Sales",
  chat: "Chat",
  chat_message: "Chat",
  message: "Chat",
  attendance: "Attendance",
  inventory: "Inventory",
  stock: "Inventory",
  stock_delivery: "Stock Movement",
  stock_movement: "Stock Movement",
  task: "Tasks",
  meeting: "Meeting Room",
  department_meeting: "Meeting Room",
  shift_closing: "Cash Management",
  cash: "Cash Management",
  staff: "Staff",
  profile: "Profile",
  settings: "Settings",
};

export function getNotificationSection(type: string): DashboardSection {
  const normalizedType = type.trim().toLocaleLowerCase().replace(/[\s-]+/g, "_");
  return notificationDestinations[normalizedType] ?? "Notifications";
}
