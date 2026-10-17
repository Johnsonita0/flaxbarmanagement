import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Archive, ChevronDown, KeyRound, RefreshCw, RotateCcw, Save, ShieldCheck, Trash2, UserRoundPlus } from "lucide-react";
import { adminRequest, assignableRoles } from "../lib/api";
import type { Department, ManagedUser } from "../lib/api";
import { roleLabel } from "../lib/roles";
import { useToast } from "../components/ToastProvider";
import PageHeading from "../components/PageHeading";
import "../css/AdminManagement.css";

interface UserListResponse {
  users: ManagedUser[];
  departments: Department[];
}

const starterAssignments = [
  { label: "1 · Bar attendant", role: "staff", department: "Bar" },
  { label: "2 · Restaurant floor staff", role: "staff", department: "Restaurant Floor" },
  { label: "3 · Kitchen staff", role: "staff", department: "Kitchen" },
  { label: "4 · Cashier", role: "cash_sales_officer", department: "Cashier" },
  { label: "5 · Storekeeper", role: "inventory_officer", department: "Inventory & Store" },
  { label: "6 · Bar supervisor", role: "department_supervisor", department: "Bar" },
  { label: "7 · Operations manager", role: "management_admin", department: "Management" },
] as const;

const primaryAdminId = "9668b2c5-428f-4d38-a29f-b5de8aa3d6b0";

export default function AdminUsersPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [resettingPasswordId, setResettingPasswordId] = useState("");
  const [workingUserId, setWorkingUserId] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await adminRequest<UserListResponse>("/users");
      setUsers(result.users.filter((user) => user.id !== primaryAdminId && user.role !== "super_admin"));
      setDepartments(result.departments);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "We couldn't load staff accounts.";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setInviteBusy(true);
    const values = new FormData(form);
    const password = String(values.get("password") ?? "");
    if (password !== String(values.get("confirmPassword") ?? "")) {
      showToast("The passwords do not match.", "error");
      setInviteBusy(false);
      return;
    }
    try {
      const result = await adminRequest<{ message: string }>("/users", {
        method: "POST",
        body: JSON.stringify({
          displayName: String(values.get("displayName") ?? "").trim(),
          email: String(values.get("email") ?? "").trim(),
          role: String(values.get("role") ?? "staff"),
          departmentId: String(values.get("departmentId") ?? "") || null,
          password,
        }),
      });
      showToast(result.message, "success");
      setShowInvite(false);
      form.reset();
      await loadUsers();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "We couldn't invite this user.", "error");
    } finally {
      setInviteBusy(false);
    }
  }

  function applyStarterAssignment(event: FormEvent<HTMLSelectElement>) {
    const assignment = starterAssignments[Number(event.currentTarget.value)];
    if (!assignment) return;
    const form = event.currentTarget.form;
    if (!form) return;
    const roleField = form.elements.namedItem("role");
    const departmentField = form.elements.namedItem("departmentId");
    if (roleField instanceof HTMLSelectElement) roleField.value = assignment.role;
    if (departmentField instanceof HTMLSelectElement) {
      departmentField.value = departments.find((department) => department.name === assignment.department)?.id ?? "";
    }
  }

  async function saveUser(user: ManagedUser, form: HTMLFormElement) {
    setSavingId(user.id);
    const values = new FormData(form);
    try {
      await adminRequest(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          role: String(values.get("role")),
          departmentId: String(values.get("departmentId") ?? "") || null,
          isActive: values.get("isActive") === "on",
        }),
      });
      showToast(`Saved access for ${user.displayName || user.email || "staff member"}.`, "success");
      await loadUsers();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "We couldn't save this account.", "error");
    } finally {
      setSavingId("");
    }
  }

  async function sendPasswordReset(user: ManagedUser) {
    setResettingPasswordId(user.id);
    try {
      const result = await adminRequest<{ message: string }>(`/users/${user.id}/password-reset`, {
        method: "POST",
      });
      showToast(result.message, "success");
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "We couldn't send the password reset email.", "error");
    } finally {
      setResettingPasswordId("");
    }
  }

  async function updateStaffState(user: ManagedUser, action: "archive" | "restore" | "delete" | "lock-pin-reset") {
    const messages = {
      archive: `Archive ${user.displayName || user.email || "this staff account"}? They will lose workspace access, but their history will remain.`,
      restore: `Restore ${user.displayName || user.email || "this staff account"} and re-enable their access?`,
      delete: `Permanently delete ${user.displayName || user.email || "this archived staff account"}? Their login and profile will be removed, but attendance history will be retained.`,
      "lock-pin-reset": `Reset ${user.displayName || user.email || "this staff member"}'s lock PIN? They will create a new four-digit PIN after signing in.`,
    };
    if (!window.confirm(messages[action])) return;

    setWorkingUserId(user.id);
    try {
      const method = action === "delete" ? "DELETE" : "POST";
      const result = await adminRequest<{ message: string }>(`/users/${user.id}/${action}`, { method });
      showToast(result.message, "success");
      await loadUsers();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "We couldn't update this staff account.", "error");
    } finally {
      setWorkingUserId("");
    }
  }

  return (
    <section className="module-page">
      <PageHeading
        title="Staff & access management"
        description="Manage staff accounts, assignments, and access. Administrator accounts are kept separate."
        action={{ label: "Register staff", onClick: () => setShowInvite(true) }}
      />
      <div className="admin-callout">
        <ShieldCheck size={18} />
        <p><strong>Administrator controls</strong><span>Administrator accounts are managed separately. Set each staff member’s initial password during registration and share it securely.</span></p>
      </div>
      <div className="admin-list-heading">
        <div><h2>Staff accounts</h2><p>{users.length} accounts</p></div>
        <button className="button button--outline" type="button" onClick={() => void loadUsers()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
      </div>
      {loadError && <div className="alert alert--error" role="alert">{loadError}</div>}
      {loading ? <p className="admin-empty">Loading staff accounts…</p> : (
        <div className="admin-user-list">
          {users.map((user) => (
            <details className="surface-card admin-user-card" key={user.id}>
              <summary className="admin-user-summary">
                <span className="initial-avatar">{(user.displayName || user.email || "?").slice(0, 1).toUpperCase()}</span>
                <span className="admin-user-summary__identity"><strong>{user.displayName || "Name not set"}</strong><small>{user.departmentName || "No department assigned"}</small></span>
                <span className={`status-pill${user.isArchived || !user.isActive ? " status-pill--warning" : ""}`}>{user.isArchived ? "Archived" : user.isActive ? "Active" : "Access locked"}</span>
                <ChevronDown className="admin-user-summary__chevron" size={17} />
              </summary>
              <form
                className="admin-user-details"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveUser(user, event.currentTarget);
                }}
              >
                <div className="admin-user-contact">{user.email || "Email unavailable"} · {roleLabel(user.role)}</div>
                <div className="admin-user-fields">
                  <label>Role
                    <select name="role" defaultValue={user.role}>
                      {assignableRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                    </select>
                  </label>
                  <label>Department
                    <select name="departmentId" defaultValue={user.departmentId ?? ""}>
                      <option value="">No department</option>
                      {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                    </select>
                  </label>
                  <label className="admin-active-toggle"><input name="isActive" type="checkbox" defaultChecked={user.isActive} disabled={user.isArchived} /> Account access enabled</label>
                  <button className="button button--outline admin-save-button" type="submit" disabled={user.isArchived || savingId === user.id}>
                    <Save size={15} />{savingId === user.id ? "Saving…" : "Save access"}
                  </button>
                  <button className="button button--outline admin-reset-button" type="button" onClick={() => void sendPasswordReset(user)} disabled={user.isArchived || resettingPasswordId === user.id}>
                    <KeyRound size={15} />{resettingPasswordId === user.id ? "Sending…" : "Send password reset"}
                  </button>
                  <div className="admin-user-actions">
                    <button className="button button--outline" type="button" onClick={() => void updateStaffState(user, "lock-pin-reset")} disabled={workingUserId === user.id}>
                      <KeyRound size={15} /> Reset lock PIN
                    </button>
                    {user.isArchived ? (
                      <>
                        <button className="button button--outline" type="button" onClick={() => void updateStaffState(user, "restore")} disabled={workingUserId === user.id}>
                          <RotateCcw size={15} /> Restore
                        </button>
                        <button className="button button--danger" type="button" onClick={() => void updateStaffState(user, "delete")} disabled={workingUserId === user.id}>
                          <Trash2 size={15} /> Delete permanently
                        </button>
                      </>
                    ) : (
                      <button className="button button--outline" type="button" onClick={() => void updateStaffState(user, "archive")} disabled={workingUserId === user.id}>
                        <Archive size={15} /> Archive staff
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </details>
          ))}
          {users.length === 0 && <p className="admin-empty">No staff accounts found.</p>}
        </div>
      )}
      {showInvite && (
        <div className="preview-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !inviteBusy) setShowInvite(false); }}>
          <section className="preview-modal__body" role="dialog" aria-modal="true" aria-labelledby="invite-user-title">
            <div className="preview-modal__heading"><h2 id="invite-user-title">Register staff member</h2><button className="preview-modal__close" type="button" onClick={() => setShowInvite(false)} aria-label="Close" disabled={inviteBusy}>×</button></div>
            <form className="form-card" onSubmit={(event) => void inviteUser(event)}>
              <label>Starter assignment
                <select defaultValue="" onChange={applyStarterAssignment}>
                  <option value="">Choose a starter role &amp; department</option>
                  {starterAssignments.map((assignment, index) => <option value={index} key={assignment.label}>{assignment.label}</option>)}
                </select>
              </label>
              <label>Full name<input name="displayName" required minLength={2} maxLength={100} autoComplete="name" /></label>
              <label>Work email<input name="email" type="email" required autoComplete="email" /></label>
              <label>Initial password<input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
              <label>Confirm password<input name="confirmPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
              <label>Role<select name="role" defaultValue="staff">{assignableRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
              <label>Department<select name="departmentId" defaultValue=""><option value="">No department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <p className="admin-form-note"><KeyRound size={15} /> Use at least 8 characters and share the password with the staff member securely.</p>
              <div className="form-actions"><button className="button button--outline" type="button" onClick={() => setShowInvite(false)} disabled={inviteBusy}>Cancel</button><button className="button button--primary" type="submit" disabled={inviteBusy}><UserRoundPlus size={16} />{inviteBusy ? "Creating…" : "Create staff account"}</button></div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
