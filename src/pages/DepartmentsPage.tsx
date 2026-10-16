import { useState } from "react";
import { ArrowRight, UsersRound } from "lucide-react";
import PageHeading from "../components/PageHeading";
import PreviewNotice from "../components/PreviewNotice";
import "./../css/OperationsPages.css";

const initialDepartments = [
  { name: "Management", lead: "Emeka Okafor", staff: 3, color: "blue" },
  { name: "Bar", lead: "Nengi Eze", staff: 8, color: "green" },
  { name: "Inventory", lead: "John Mensah", staff: 4, color: "amber" },
  { name: "Cashier", lead: "Blessing Udo", staff: 3, color: "violet" },
  { name: "Customer Service", lead: "Tunde Adebayo", staff: 5, color: "blue" },
  { name: "Maintenance", lead: "—", staff: 2, color: "teal" },
];

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState(initialDepartments);
  const [showForm, setShowForm] = useState(false);
  return (
    <section className="module-page">
      <PageHeading title="Departments" description="Manage teams, supervisors and department assignments." action={{ label: "Add Department", onClick: () => setShowForm(true) }} />
      <PreviewNotice />
      <label className="search-field"><UsersRound size={16} /><input placeholder="Search departments…" /></label>
      <div className="department-grid">
        {departments.map((department) => (
          <article className="surface-card department-card" key={department.name}>
            <span className={`department-icon department-icon--${department.color}`}><UsersRound size={19} /></span>
            <div className="department-card__text"><strong>{department.name}</strong><small>{department.lead} · Supervisor</small></div>
            <span className="department-card__count">{department.staff} staff</span>
            <button className="department-card__link" aria-label={`View ${department.name} department`}> <ArrowRight size={16} /></button>
          </article>
        ))}
      </div>
      {showForm && <div className="preview-modal"><section className="preview-modal__body" role="dialog" aria-modal="true"><div className="preview-modal__heading"><h2>New department</h2><button className="preview-modal__close" onClick={() => setShowForm(false)}>×</button></div><form className="form-card" onSubmit={(event) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name") ?? "").trim(); if (name) setDepartments((current) => [...current, { name, lead: "Unassigned", staff: 0, color: "blue" }]); setShowForm(false); }}><label>Department name<input name="name" required /></label><div className="form-actions"><button className="button button--outline" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button button--primary" type="submit">Add to preview</button></div></form></section></div>}
    </section>
  );
}
