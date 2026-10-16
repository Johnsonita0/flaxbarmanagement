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

  throw new Error("VITE_API_BASE_URL is not configured for this deployment.");
}

export async function fetchCurrentUser(session: Session): Promise<CurrentUser> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/me`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error ?? `The API returned an error (${response.status}).`);
  }

  return (await response.json()) as CurrentUser;
}
