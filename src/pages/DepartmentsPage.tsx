import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowDown, ArrowRight, Pencil, RefreshCw, UsersRound } from "lucide-react";
import { adminRequest } from "../lib/api";
import type { Department } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import PageHeading from "../components/PageHeading";
import "../css/OperationsPages.css";

interface DepartmentResponse {
  departments: Department[];
}

export default function DepartmentsPage({ canManage }: { canManage: boolean }) {
  const { showToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [expandedDepartmentId, setExpandedDepartmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSalesId, setSavingSalesId] = useState("");
  const [savingHeadId, setSavingHeadId] = useState("");
  const [error, setError] = useState("");

  const loadDepartments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await adminRequest<DepartmentResponse>("/departments");
      setDepartments(result.departments);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't load departments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDepartments();
  }, [loadDepartments]);

  const visibleDepartments = useMemo(
    () => departments.filter((department) => department.name.toLowerCase().includes(query.toLowerCase())),
    [departments, query],
  );

  function isSalesEligible(department: Department) {
    return department.salesEligible ?? !/\b(management|admin|administration|kitchen|inventory|store|cleaning|maintenance|security|finance|human resources|operations|laundry)\b/i.test(department.name);
  }

  async function saveDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    setSaving(true);
    try {
      if (editingDepartment) {
        const result = await adminRequest<{ department: Pick<Department, "id" | "name" | "salesEnabled"> }>(`/departments/${editingDepartment.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name }),
        });
        setDepartments((current) => current.map((department) =>
          department.id === result.department.id
            ? { ...department, name: result.department.name, salesEnabled: result.department.salesEnabled }
            : department,
        ));
        showToast(`${name} department renamed.`, "success");
      } else {
        await adminRequest("/departments", { method: "POST", body: JSON.stringify({ name }) });
        showToast(`${name} department created.`, "success");
      }
      form.reset();
      setShowForm(false);
      setEditingDepartment(null);
      await loadDepartments();
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't create this department.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function setDepartmentSales(department: Department, salesEnabled: boolean) {
    setSavingSalesId(department.id);
    try {
      await adminRequest(`/departments/${department.id}/sales`, {
        method: "PATCH",
        body: JSON.stringify({ salesEnabled }),
      });
      setDepartments((current) => current.map((item) => item.id === department.id ? { ...item, salesEnabled } : item));
      showToast(`${department.name} sales ${salesEnabled ? "enabled" : "disabled"}.`, "success");
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't update department sales access.", "error");
    } finally {
      setSavingSalesId("");
    }
  }

  async function setDepartmentHead(department: Department, headUserId: string) {
    setSavingHeadId(department.id);
    try {
      const result = await adminRequest<{ department: { headUserId: string | null; headName: string | null } }>(
        `/departments/${department.id}/head`,
        { method: "PATCH", body: JSON.stringify({ headUserId: headUserId || null }) },
      );
      setDepartments((current) => current.map((item) => item.id === department.id
        ? { ...item, headUserId: result.department.headUserId, headName: result.department.headName }
        : item));
      showToast(result.department.headName
        ? `${result.department.headName} is now head of ${department.name}.`
        : `${department.name} department head cleared.`, "success");
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't assign the department head.", "error");
    } finally {
      setSavingHeadId("");
    }
  }

  return (
    <section className="module-page">
      <PageHeading
        title="Departments"
        description="Organize your team into departments."
        action={canManage ? { label: "Add Department", onClick: () => { setEditingDepartment(null); setShowForm(true); } } : undefined}
      />
      {canManage && <div className="admin-callout"><UsersRound size={18} /><p><strong>Department administration</strong><span>View assigned staff, manage department names, and enable sales only for customer-facing teams.</span></p></div>}
      <div className="admin-list-heading">
        <div><h2>Team departments</h2><p>{departments.length} departments</p></div>
        <button className="button button--outline" type="button" onClick={() => void loadDepartments()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
      </div>
      <label className="search-field"><UsersRound size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search departments…" /></label>
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {loading ? <p className="admin-empty">Loading departments…</p> : (
        <div className="department-grid">
          {visibleDepartments.map((department) => (
            <article className={`surface-card department-card${expandedDepartmentId === department.id ? " department-card--expanded" : ""}`} key={department.id}>
              <div className="department-card__summary">
                <span className="department-icon department-icon--blue"><UsersRound size={19} /></span>
                <div className="department-card__text"><strong>{department.name}</strong><small>{department.staffCount ?? 0} team members</small></div>
                {canManage && isSalesEligible(department)
                  ? <label className="department-sales-toggle"><input type="checkbox" checked={department.salesEnabled} disabled={savingSalesId === department.id} onChange={(event) => void setDepartmentSales(department, event.currentTarget.checked)} /><span>Sales</span></label>
                  : canManage && <span className="department-sales-unavailable">Not a sales team</span>}
                {canManage && <button className="department-card__link" type="button" aria-label={`Rename ${department.name} department`} onClick={() => { setEditingDepartment(department); setShowForm(true); }}><Pencil size={14} /></button>}
                <button className="department-card__link" type="button" aria-expanded={expandedDepartmentId === department.id} aria-label={`${expandedDepartmentId === department.id ? "Hide" : "View"} staff in ${department.name}`} onClick={() => setExpandedDepartmentId((current) => current === department.id ? null : department.id)}>{expandedDepartmentId === department.id ? <ArrowDown size={16} /> : <ArrowRight size={16} />}</button>
              </div>
              {expandedDepartmentId === department.id && <section className="department-members" aria-label={`${department.name} team members`}>
                <div className="department-members__heading"><strong>Team members</strong><span>{department.members?.length ?? 0}</span></div>
                {canManage && <label className="department-head-select">Head of department
                  <select value={department.headUserId ?? ""} disabled={savingHeadId === department.id} onChange={(event) => void setDepartmentHead(department, event.target.value)}>
                    <option value="">Not assigned — select a department member</option>
                    {(department.members ?? []).filter((member) => member.isActive).map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}
                  </select>
                </label>}
                {department.members && department.members.length > 0
                  ? department.members.map((member) => <div className="department-member" key={member.id}>
                    <span className="department-member__avatar">{member.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
                    <span className="department-member__details"><strong>{member.name}</strong><small>{member.role.replaceAll("_", " ")}</small></span>
                    <span className={`department-member__status${member.isActive ? " department-member__status--active" : ""}`}>{member.isActive ? "Active" : "Inactive"}</span>
                  </div>)
                  : <p className="department-members__empty">No staff members are assigned to this department yet.</p>}
              </section>}
            </article>
          ))}
          {visibleDepartments.length === 0 && <p className="admin-empty">{departments.length ? "No departments match your search." : "No departments have been created yet."}</p>}
        </div>
      )}
      {showForm && (
        <div className="preview-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowForm(false); }}>
          <section className="preview-modal__body" role="dialog" aria-modal="true" aria-labelledby="new-department-title">
            <div className="preview-modal__heading"><h2 id="new-department-title">{editingDepartment ? "Rename department" : "New department"}</h2><button className="preview-modal__close" type="button" onClick={() => { setShowForm(false); setEditingDepartment(null); }} disabled={saving} aria-label="Close">×</button></div>
            <form className="form-card" onSubmit={(event) => void saveDepartment(event)}>
              <label>Department name<input name="name" required minLength={2} maxLength={80} autoFocus defaultValue={editingDepartment?.name ?? ""} /></label>
              <div className="form-actions"><button className="button button--outline" type="button" onClick={() => { setShowForm(false); setEditingDepartment(null); }} disabled={saving}>Cancel</button><button className="button button--primary" type="submit" disabled={saving}>{saving ? "Saving…" : editingDepartment ? "Save name" : "Create department"}</button></div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
