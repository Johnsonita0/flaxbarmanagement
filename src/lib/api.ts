import type { Session } from "@supabase/supabase-js";

export type AppRole =
  | "super_admin"
  | "management_admin"
  | "department_supervisor"
  | "inventory_officer"
  | "cash_sales_officer"
  | "staff";

export interface CurrentUser {
  id: string;
  email: string | null;
  displayName: string | null;
  role: AppRole;
}

function getApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  if (import.meta.env.DEV) {
    return "http://localhost:3000";
  }

  throw new Error("Account services are temporarily unavailable. Please contact your administrator.");
}

export async function fetchCurrentUser(session: Session): Promise<CurrentUser> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/me`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session has expired. Please sign in again.");
    }
    if (response.status === 403) {
      throw new Error("Your account is not approved to access this workspace. Please contact your administrator.");
    }
    throw new Error("We couldn't load your account details. Please try again or contact your administrator.");
  }

  return (await response.json()) as CurrentUser;
}
