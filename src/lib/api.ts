import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import {
  cacheApiResponse,
  createOfflineOperationKey,
  enqueueOfflineOperation,
  getCachedApiResponse,
  cacheVerifiedDeviceSession,
  hasVerifiedDeviceSession,
  isOfflineCapableWrite,
} from "./offlineSync";

export class OfflineRequestQueuedError extends Error {
  constructor() {
    super("OFFLINE_QUEUED:This action was saved on this device and will sync when internet is available.");
    this.name = "OfflineRequestQueuedError";
  }
}

export type AppRole =
  | "super_admin"
  | "management_admin"
  | "department_supervisor"
  | "inventory_officer"
  | "cash_sales_officer"
  | "staff";

export interface CurrentUser {
  id: string;
  companyId: string;
  companyName: string;
  businessType: "pharmacy" | "bar" | "restaurant" | "bar_restaurant";
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
  barcode: string | null;
  stock: number;
  unit: string;
  reorder: number;
  centralStock: number;
  inTransitStock: number;
  averageUnitCost?: number;
  imagePath: string | null;
  departmentId: string | null;
  departmentName: string | null;
  price: number;
  createdAt: string;
  updatedAt: string;
}

export interface VendorPurchase {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  vendorName: string;
  reference: string | null;
  packageQuantity: number;
  unitsPerPackage: number;
  totalUnits: number;
  ratePerPackage: number;
  invoiceTotal: number;
  amountPaid: number;
  balance: number;
  createdByName: string;
  createdAt: string;
  payments: { id: string; amount: number; method: string; paidByName: string; paidAt: string }[];
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

async function requestAccountSession(
  path: string,
  session: Session,
  requestBody?: Record<string, boolean>,
): Promise<{ response: Response; body: { code?: string; error?: string } | null }> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/json",
        ...(requestBody ? { "Content-Type": "application/json" } : {}),
      },
      ...(requestBody ? { body: JSON.stringify(requestBody) } : {}),
    });
  } catch {
    throw new Error("We couldn't reach the workspace to verify this device.");
  }
  const body = await response.json().catch(() => null) as { code?: string; error?: string } | null;
  return { response, body };
}

export async function claimDeviceSession(session: Session, replaceExisting = false): Promise<boolean> {
  const { response, body } = await requestAccountSession(
    "/api/v1/session/claim",
    session,
    replaceExisting ? { replaceExisting: true } : undefined,
  );
  if (response.status === 409 && body?.code === "DEVICE_SESSION_NOT_REGISTERED") return false;
  if (!response.ok) throw new Error(body?.error ?? "We couldn't verify this device. Please try again.");
  try {
    await cacheVerifiedDeviceSession(session.user.id);
  } catch (error: unknown) {
    console.error("The verified device session could not be cached for offline use.", error);
  }
  return true;
}

export function hasCachedDeviceSession(userId: string) {
  return hasVerifiedDeviceSession(userId);
}

export async function releaseDeviceSession(session: Session): Promise<void> {
  const { response, body } = await requestAccountSession("/api/v1/session/release", session);
  if (!response.ok) throw new Error(body?.error ?? "We couldn't release this device's sign-in session.");
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!supabase) throw new Error("Account services are temporarily unavailable.");
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error("Your sign-in session has expired. Please sign in again.");

  const method = (init.method ?? "GET").toUpperCase();
  const canQueue = isOfflineCapableWrite(path, method);
  const operationKey = canQueue ? createOfflineOperationKey() : null;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (operationKey) headers.set("Idempotency-Key", operationKey);

  const saveOffline = async () => {
    if (!operationKey || (init.body !== undefined && init.body !== null && typeof init.body !== "string")) {
      throw new Error("This action cannot be saved offline. Reconnect to the internet and try again.");
    }
    const storedHeaders: Record<string, string> = {};
    headers.forEach((value, name) => {
      if (name.toLowerCase() !== "authorization") storedHeaders[name] = value;
    });
    await enqueueOfflineOperation({
      id: operationKey,
      userId: session.user.id,
      key: operationKey,
      path,
      method,
      body: typeof init.body === "string" ? init.body : null,
      headers: storedHeaders,
      createdAt: Date.now(),
      status: "pending",
      message: null,
    });
    throw new OfflineRequestQueuedError();
  };

  if (canQueue && !navigator.onLine) return saveOffline();

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers,
    });
  } catch (error: unknown) {
    if (canQueue && (error instanceof TypeError || !navigator.onLine)) return saveOffline();
    if (method === "GET") {
      try {
        const cached = await getCachedApiResponse<T>(session.user.id, path);
        if (cached !== null) return cached;
      } catch (cacheError: unknown) {
        console.error("Could not read cached Flex Bar data.", cacheError);
      }
    }
    throw new Error("We couldn't reach the workspace. Check your connection and try again.");
  }

  const body = await response.json().catch(() => null) as { code?: string; error?: string } | null;
  if (!response.ok) {
    if (body?.code === "ACCOUNT_SESSION_REPLACED" || body?.code === "ACCOUNT_SESSION_NOT_REGISTERED") {
      window.dispatchEvent(new Event("flexbar:account-session-replaced"));
    }
    throw new Error(body?.error ?? "We couldn't complete that request. Please try again.");
  }
  if (method === "GET") {
    try {
      await cacheApiResponse(session.user.id, path, body);
    } catch (error: unknown) {
      console.error("Flex Bar data could not be cached for offline use.", error);
      window.dispatchEvent(new CustomEvent("flexbar:offline-storage-error", {
        detail: { message: "Some data could not be saved for offline use on this device." },
      }));
    }
  }
  return body as T;
}

export function adminRequest<T>(path: string, init: RequestInit = {}) {
  return apiRequest<T>(`/api/v1/admin${path}`, init);
}

export async function fetchCurrentUser(session: Session): Promise<CurrentUser> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/api/v1/me`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/json",
      },
    });
  } catch (error: unknown) {
    if (navigator.onLine) throw error;
    const cached = await getCachedApiResponse<CurrentUser>(session.user.id, "/api/v1/me");
    if (cached && cached.id === session.user.id) return cached;
    throw error;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { code?: string } | null;
    if (body?.code === "ACCOUNT_SESSION_REPLACED" || body?.code === "ACCOUNT_SESSION_NOT_REGISTERED") {
      window.dispatchEvent(new Event("flexbar:account-session-replaced"));
    }
    if (response.status === 401) {
      throw new Error("Your session has expired. Please sign in again.");
    }
    if (response.status === 403) {
      throw new Error("Your account is not approved to access this workspace. Please contact your administrator.");
    }
    throw new Error("We couldn't load your account details. Please try again or contact your administrator.");
  }

  const currentUser = (await response.json()) as CurrentUser;
  try {
    await cacheApiResponse(session.user.id, "/api/v1/me", currentUser);
  } catch (error: unknown) {
    console.error("The signed-in user profile could not be cached for offline use.", error);
  }
  return currentUser;
}
