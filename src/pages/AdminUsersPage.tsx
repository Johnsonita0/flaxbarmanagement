import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { MailPlus, RefreshCw, Save, ShieldCheck, UserRoundPlus } from "lucide-react";
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
  const [showInvite, setShowInvite] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await adminRequest<UserListResponse>("/users");
      setUsers(result.users);
      setDepartments(result.departments);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "We couldn't load team accounts.";
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
    try {
      const result = await adminRequest<{ message: string }>("/users", {
        method: "POST",
        body: JSON.stringify({
          displayName: String(values.get("displayName") ?? "").trim(),
          email: String(values.get("email") ?? "").trim(),
          role: String(values.get("role") ?? "staff"),
          departmentId: String(values.get("departmentId") ?? "") || null,
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
      showToast(`Saved access for ${user.displayName || user.email || "team member"}.`, "success");
      await loadUsers();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "We couldn't save this account.", "error");
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="module-page">
      <PageHeading
        title="User & role management"
        description="Invite team members, assign their access, and manage account status."
        action={{ label: "Invite user", onClick: () => setShowInvite(true) }}
      />
      <div className="admin-callout">
        <ShieldCheck size={18} />
        <p><strong>Super-admin controls</strong><span>The primary super-admin account is protected. New team members receive an email invitation to set their own password.</span></p>
      </div>
      <div className="admin-list-heading">
        <div><h2>Team accounts</h2><p>{users.length} accounts</p></div>
        <button className="button button--outline" type="button" onClick={() => void loadUsers()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
      </div>
      {loadError && <div className="alert alert--error" role="alert">{loadError}</div>}
      {loading ? <p className="admin-empty">Loading team accounts…</p> : (
        <div className="admin-user-list">
          {users.map((user) => {
            const isPrimaryAdmin = user.id === primaryAdminId;
            return (
              <form
                className="surface-card admin-user-card"
                key={user.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveUser(user, event.currentTarget);
                }}
              >
                <div className="admin-user-identity">
                  <span className="initial-avatar">{(user.displayName || user.email || "?").slice(0, 1).toUpperCase()}</span>
                  <span><strong>{user.displayName || "Name not set"}{isPrimaryAdmin && <em className="admin-owner-badge">Primary admin</em>}</strong><small>{user.email || "Email unavailable"}</small></span>
                  <span className={`status-pill${user.isActive ? "" : " status-pill--warning"}`}>{user.isActive ? "Active" : "Inactive"}</span>
                </div>
                <div className="admin-user-fields">
                  <label>Role
                    <select name="role" defaultValue={user.role} disabled={isPrimaryAdmin}>
                      {assignableRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                      {isPrimaryAdmin && <option value="super_admin">Super Admin</option>}
                    </select>
                  </label>
                  <label>Department
                    <select name="departmentId" defaultValue={user.departmentId ?? ""}>
                      <option value="">No department</option>
                      {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                    </select>
                  </label>
                  <label className="admin-active-toggle"><input name="isActive" type="checkbox" defaultChecked={user.isActive} disabled={isPrimaryAdmin} /> Account active</label>
                  <button className="button button--outline admin-save-button" type="submit" disabled={isPrimaryAdmin || savingId === user.id}>
                    <Save size={15} />{savingId === user.id ? "Saving…" : "Save access"}
                  </button>
                </div>
              </form>
            );
          })}
          {users.length === 0 && <p className="admin-empty">No accounts found.</p>}
        </div>
      )}
      {showInvite && (
        <div className="preview-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !inviteBusy) setShowInvite(false); }}>
          <section className="preview-modal__body" role="dialog" aria-modal="true" aria-labelledby="invite-user-title">
            <div className="preview-modal__heading"><h2 id="invite-user-title">Invite a team member</h2><button className="preview-modal__close" type="button" onClick={() => setShowInvite(false)} aria-label="Close" disabled={inviteBusy}>×</button></div>
            <form className="form-card" onSubmit={(event) => void inviteUser(event)}>
              <label>Starter assignment
                <select defaultValue="" onChange={applyStarterAssignment}>
                  <option value="">Choose a starter role &amp; department</option>
                  {starterAssignments.map((assignment, index) => <option value={index} key={assignment.label}>{assignment.label}</option>)}
                </select>
              </label>
              <label>Full name<input name="displayName" required minLength={2} maxLength={100} autoComplete="name" /></label>
              <label>Work email<input name="email" type="email" required autoComplete="email" /></label>
              <label>Role<select name="role" defaultValue="staff">{assignableRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
              <label>Department<select name="departmentId" defaultValue=""><option value="">No department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <p className="admin-form-note"><MailPlus size={15} /> We’ll email a secure invitation so they can create their password.</p>
              <div className="form-actions"><button className="button button--outline" type="button" onClick={() => setShowInvite(false)} disabled={inviteBusy}>Cancel</button><button className="button button--primary" type="submit" disabled={inviteBusy}><UserRoundPlus size={16} />{inviteBusy ? "Sending…" : "Send invitation"}</button></div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
