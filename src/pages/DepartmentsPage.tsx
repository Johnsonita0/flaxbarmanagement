import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, RefreshCw, UsersRound } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  async function createDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    setSaving(true);
    try {
      await adminRequest("/departments", { method: "POST", body: JSON.stringify({ name }) });
      showToast(`${name} department created.`, "success");
      form.reset();
      setShowForm(false);
      await loadDepartments();
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't create this department.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="module-page">
      <PageHeading
        title="Departments"
        description="Organize your team into departments."
        action={canManage ? { label: "Add Department", onClick: () => setShowForm(true) } : undefined}
      />
      {canManage && <div className="admin-callout"><UsersRound size={18} /><p><strong>Department administration</strong><span>As super admin, you can create departments and assign team members to them.</span></p></div>}
      <div className="admin-list-heading">
        <div><h2>Team departments</h2><p>{departments.length} departments</p></div>
        <button className="button button--outline" type="button" onClick={() => void loadDepartments()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
      </div>
      <label className="search-field"><UsersRound size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search departments…" /></label>
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {loading ? <p className="admin-empty">Loading departments…</p> : (
        <div className="department-grid">
          {visibleDepartments.map((department) => (
            <article className="surface-card department-card" key={department.id}>
              <span className="department-icon department-icon--blue"><UsersRound size={19} /></span>
              <div className="department-card__text"><strong>{department.name}</strong><small>{department.staffCount ?? 0} team members</small></div>
              <button className="department-card__link" type="button" aria-label={`View ${department.name} department`} onClick={() => setQuery(department.name)}><ArrowRight size={16} /></button>
            </article>
          ))}
          {visibleDepartments.length === 0 && <p className="admin-empty">{departments.length ? "No departments match your search." : "No departments have been created yet."}</p>}
        </div>
      )}
      {showForm && (
        <div className="preview-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowForm(false); }}>
          <section className="preview-modal__body" role="dialog" aria-modal="true" aria-labelledby="new-department-title">
            <div className="preview-modal__heading"><h2 id="new-department-title">New department</h2><button className="preview-modal__close" type="button" onClick={() => setShowForm(false)} disabled={saving} aria-label="Close">×</button></div>
            <form className="form-card" onSubmit={(event) => void createDepartment(event)}>
              <label>Department name<input name="name" required minLength={2} maxLength={80} autoFocus /></label>
              <div className="form-actions"><button className="button button--outline" type="button" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button><button className="button button--primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create department"}</button></div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
