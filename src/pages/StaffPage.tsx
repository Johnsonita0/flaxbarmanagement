import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import PageHeading from "../components/PageHeading";
import PreviewNotice from "../components/PreviewNotice";
import type { DashboardSection } from "../components/DashboardSidebar";
import "./../css/OperationsPages.css";

type StaffStatus = "Active" | "On Leave" | "Resigned";
type StaffRecord = { name: string; role: string; department: string; status: StaffStatus };

const initialStaff: StaffRecord[] = [
  { name: "Emeka Okafor", role: "Manager", department: "Management", status: "Active" },
  { name: "Blessing Udo", role: "Cashier", department: "Cashier", status: "Active" },
  { name: "John Mensah", role: "Store Attendant", department: "Inventory", status: "Active" },
  { name: "Nengi Eze", role: "Supervisor", department: "Bar", status: "Active" },
  { name: "David Wilson", role: "Stock Controller", department: "Inventory", status: "On Leave" },
];

export default function StaffPage({ onNavigate }: { onNavigate: (section: DashboardSection) => void }) {
  const [staff, setStaff] = useState(initialStaff);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<StaffRecord | null>(null);
  const visibleStaff = useMemo(
    () => staff.filter((person) =>
      (filter === "All" || person.status === filter) &&
      `${person.name} ${person.role} ${person.department}`.toLowerCase().includes(query.toLowerCase()),
    ),
    [filter, query, staff],
  );

  return (
    <section className="module-page">
      <PageHeading title={selected ? "Staff Profile" : "Staff Management"} description={selected ? "Staff profile and assigned department." : "Manage staff profiles, roles and department assignments."} action={!selected ? { label: "Add Staff", onClick: () => setShowForm(true) } : undefined} />
      <PreviewNotice />
      {selected ? (
        <div className="surface-card staff-profile-card">
          <button className="icon-link" onClick={() => setSelected(null)}>← Back to staff</button>
          <div className="staff-profile-summary"><span className="initial-avatar initial-avatar--large">{selected.name.split(" ").map((part) => part[0]).join("")}</span><div><h2>{selected.name}</h2><p>{selected.role} · {selected.department}</p><span className="status-pill">{selected.status}</span></div></div>
          <div className="profile-data-grid"><div><small>Email</small><strong>{selected.name.toLowerCase().replace(" ", ".")}@flexbar.example</strong></div><div><small>Department</small><strong>{selected.department}</strong></div><div><small>Account role</small><strong>{selected.role}</strong></div></div>
          <button className="button button--outline" onClick={() => onNavigate("Attendance")}>View attendance history</button>
        </div>
      ) : (
        <>
          <div className="surface-card staff-list-card">
            <div className="toolbar-row"><label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search staff…" /></label></div>
            <div className="tab-strip">{["All", "Active", "On Leave", "Resigned"].map((tab) => <button className={`tab-chip${filter === tab ? " tab-chip--active" : ""}`} key={tab} onClick={() => setFilter(tab)}>{tab}</button>)}</div>
            <div className="record-list">
              {visibleStaff.map((person) => (
                <button className="record-row record-row--button" key={person.name} onClick={() => setSelected(person)}>
                  <span className="initial-avatar">{person.name.split(" ").map((part) => part[0]).join("")}</span>
                  <span className="record-row__main"><strong>{person.name}</strong><small>{person.role} · {person.department}</small></span>
                  <span className={`status-pill${person.status === "On Leave" ? " status-pill--warning" : person.status === "Resigned" ? " status-pill--danger" : ""}`}>{person.status}</span>
                </button>
              ))}
              {visibleStaff.length === 0 && <p className="empty-state">No staff match this filter.</p>}
            </div>
          </div>
          <button className="icon-link" onClick={() => onNavigate("Departments")}>Manage departments →</button>
        </>
      )}
      {showForm && (
        <div className="preview-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}>
          <section className="preview-modal__body" role="dialog" aria-modal="true" aria-labelledby="add-staff-title">
            <div className="preview-modal__heading"><h2 id="add-staff-title">Add staff member</h2><button className="preview-modal__close" onClick={() => setShowForm(false)} aria-label="Close">×</button></div>
            <form className="form-card" onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              const name = String(values.get("name") ?? "").trim();
              const role = String(values.get("role") ?? "").trim();
              const department = String(values.get("department") ?? "").trim();
              if (name && role && department) setStaff((current) => [{ name, role, department, status: "Active" }, ...current]);
              setShowForm(false);
            }}>
              <label>Full name<input name="name" required /></label>
              <label>Job title<input name="role" required /></label>
              <label>Department<select name="department"><option>Bar</option><option>Cashier</option><option>Inventory</option><option>Management</option></select></label>
              <div className="form-actions"><button className="button button--outline" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button button--primary" type="submit">Add to preview</button></div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
