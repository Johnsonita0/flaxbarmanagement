import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

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
  avatarPath: string | null;
  hasLockPin: boolean;
  departmentId: string | null;
  salesEnabled: boolean;
  role: AppRole;
}

export function getProfilePhotoUrl(avatarPath: string | null): string | null {
  if (!supabase || !avatarPath) return null;
  return supabase.storage.from("profile-photos").getPublicUrl(avatarPath).data.publicUrl;
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

export interface Department {
  id: string;
  name: string;
  salesEnabled: boolean;
  salesEligible?: boolean;
  members?: DepartmentMember[];
  headUserId?: string | null;
  headName?: string | null;
  created_at?: string;
  staffCount?: number;
}

export interface DepartmentMember {
  id: string;
  name: string;
  role: AppRole;
  isActive: boolean;
}

export interface ManagedUser {
  id: string;
  displayName: string | null;
  email: string | null;
  role: AppRole;
  isActive: boolean;
  isArchived: boolean;
  departmentId: string | null;
  departmentName: string | null;
}

export interface InventoryProduct {
  id: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  reorder: number;
  imagePath: string | null;
  departmentId: string | null;
  departmentName: string | null;
  price: number;
  createdAt: string;
  updatedAt: string;
}

export function getProductImageUrl(imagePath: string | null): string | null {
  if (!supabase || !imagePath) return null;
  return supabase.storage.from("product-images").getPublicUrl(imagePath).data.publicUrl;
}

export const assignableRoles: Exclude<AppRole, "super_admin">[] = [
  "management_admin",
  "department_supervisor",
  "inventory_officer",
  "cash_sales_officer",
  "staff",
];

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!supabase) throw new Error("Account services are temporarily unavailable.");
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error("Your sign-in session has expired. Please sign in again.");

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new Error("We couldn't reach the workspace. Check your connection and try again.");
  }

  const body = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "We couldn't complete that request. Please try again.");
  }
  return body as T;
}

export function adminRequest<T>(path: string, init: RequestInit = {}) {
  return apiRequest<T>(`/api/v1/admin${path}`, init);
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
