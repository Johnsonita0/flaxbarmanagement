import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { CurrentUser, Department, DepartmentMember } from "../lib/api";
import { apiRequest } from "../lib/api";
import { roleLabel } from "../lib/roles";
import PageHeading from "../components/PageHeading";
import type { DashboardSection } from "../components/DashboardSidebar";
import "./../css/OperationsPages.css";

interface StaffRecord extends DepartmentMember {
  department: string;
}

export default function StaffPage({ user, onNavigate }: { user: CurrentUser; onNavigate: (section: DashboardSection) => void }) {
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<StaffRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void apiRequest<{ departments: (Department & { members?: DepartmentMember[] })[] }>("/api/v1/admin/departments")
      .then(({ departments }) => {
        if (!active) return;
        const visibleDepartments = user.role === "management_admin" || user.role === "super_admin"
          ? departments
          : departments.filter((department) => department.id === user.departmentId);
        setStaff(visibleDepartments.flatMap((department) =>
          (department.members ?? []).map((member) => ({ ...member, department: department.name })),
        ));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "We couldn't load department staff.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [user.departmentId, user.role]);

  const visibleStaff = useMemo(
    () => staff.filter((person) =>
      (filter === "All" || (filter === "Active" ? person.isActive : !person.isActive)) &&
      `${person.name} ${roleLabel(person.role)} ${person.department}`.toLowerCase().includes(query.trim().toLowerCase()),
    ),
    [filter, query, staff],
  );
  const filters = ["All", "Active", "Inactive"];

  return (
    <section className="module-page">
      <PageHeading
        title={selected ? "Staff profile" : user.role === "management_admin" ? "Staff directory" : "Department staff"}
        description={selected ? "Current account and department assignment." : "Staff accounts currently assigned to your department."}
      />
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {selected ? (
        <div className="surface-card staff-profile-card">
          <button className="icon-link" type="button" onClick={() => setSelected(null)}>← Back to staff</button>
          <div className="staff-profile-summary">
            <span className="initial-avatar initial-avatar--large">{selected.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
            <div><h2>{selected.name}</h2><p>{roleLabel(selected.role)} · {selected.department}</p><span className={`status-pill${selected.isActive ? "" : " status-pill--neutral"}`}>{selected.isActive ? "Active account" : "Inactive account"}</span></div>
          </div>
          <div className="profile-data-grid"><div><small>Department</small><strong>{selected.department}</strong></div><div><small>Account role</small><strong>{roleLabel(selected.role)}</strong></div><div><small>Account status</small><strong>{selected.isActive ? "Active" : "Inactive"}</strong></div></div>
          <button className="button button--outline" type="button" onClick={() => onNavigate("Attendance")}>Open attendance</button>
        </div>
      ) : (
        <div className="surface-card staff-list-card">
          <div className="toolbar-row"><label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search staff…" /></label></div>
          <div className="tab-strip">{filters.map((tab) => <button className={`tab-chip${filter === tab ? " tab-chip--active" : ""}`} key={tab} type="button" onClick={() => setFilter(tab)}>{tab}</button>)}</div>
          {loading ? <p className="empty-state">Loading staff directory…</p> : (
            <div className="record-list">
              {visibleStaff.map((person) => <button className="record-row record-row--button" key={person.id} type="button" onClick={() => setSelected(person)}>
                <span className="initial-avatar">{person.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
                <span className="record-row__main"><strong>{person.name}</strong><small>{roleLabel(person.role)} · {person.department}</small></span>
                <span className={`status-pill${person.isActive ? "" : " status-pill--neutral"}`}>{person.isActive ? "Active" : "Inactive"}</span>
              </button>)}
              {!error && visibleStaff.length === 0 && <p className="empty-state">{staff.length ? "No staff match this filter." : "No staff accounts are assigned to this department yet."}</p>}
            </div>
          )}
        </div>
      )}
      {user.role === "super_admin" && <button className="icon-link" type="button" onClick={() => onNavigate("Departments")}>Manage departments →</button>}
    </section>
  );
}
