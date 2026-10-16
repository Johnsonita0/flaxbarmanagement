import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Filter } from "lucide-react";
import PageHeading from "../components/PageHeading";
import PreviewNotice from "../components/PreviewNotice";
import "./../css/OperationsPages.css";

const reports = [
  { title: "Staff Report", description: "Staff profiles, roles and status", icon: "staff" },
  { title: "Sales Report", description: "Sales by date, department or staff", icon: "sales" },
  { title: "Cash Report", description: "Cash received, expenses and variance", icon: "cash" },
  { title: "Inventory Report", description: "Stock levels and stock movement", icon: "inventory" },
  { title: "Workflow Report", description: "Task progress and completion", icon: "tasks" },
];

export default function ReportsPage() {
  const [showFilters, setShowFilters] = useState(false);
  const [notice, setNotice] = useState("");
  const [category, setCategory] = useState("Overview");
  return (
    <section className="module-page">
      <PageHeading title="Reports" description="Filter and review operational performance." action={{ label: "Filters", onClick: () => setShowFilters((open) => !open) }} />
      <PreviewNotice />
      <div className="tab-strip">{["Overview", "Staff", "Sales", "Cash", "Inventory", "Workflow"].map((tab) => <button className={`tab-chip${category === tab ? " tab-chip--active" : ""}`} key={tab} onClick={() => setCategory(tab)}>{tab}</button>)}</div>
      {showFilters && <form className="surface-card form-card report-filters" onSubmit={(event) => { event.preventDefault(); setNotice("Filter preview updated. Live report data is not connected."); setShowFilters(false); }}><div className="surface-card__heading"><h2><Filter size={15} /> Filter reports</h2><button type="button" onClick={() => setShowFilters(false)}>Close</button></div><label>Date range<select><option>Apr 26, 2026 – May 2, 2026</option><option>This month</option><option>Custom range</option></select></label><label>Department<select><option>All departments</option><option>Bar</option><option>Inventory</option><option>Management</option></select></label><label>Staff member<select><option>All staff</option><option>My activity</option></select></label><label>Activity<select><option>All activities</option><option>Sales</option><option>Cash</option><option>Attendance</option></select></label><div className="form-actions"><button className="button button--outline" type="reset">Reset</button><button className="button button--primary" type="submit">Apply filters</button></div></form>}
      {notice && <div className="alert alert--success" role="status">{notice}</div>}
      <div className="surface-card reports-list"><div className="surface-card__heading"><div><h2>{category} reports</h2><p>Sample report catalogue</p></div><span className="status-pill status-pill--neutral">Preview</span></div>{reports.filter((report) => category === "Overview" || report.title.toLowerCase().includes(category.toLowerCase())).map((report) => <div className="record-row" key={report.title}><span className={`report-icon report-icon--${report.icon}`}>{report.icon === "cash" ? "₦" : report.icon === "inventory" ? "▦" : report.icon === "sales" ? "↗" : report.icon === "tasks" ? "✓" : "▤"}</span><span className="record-row__main"><strong>{report.title}</strong><small>{report.description}</small></span><button className="report-row-action" onClick={() => setNotice(`${report.title} will be available when report data is connected.`)}>View</button></div>)}</div>
      <div className="surface-card export-card"><div className="surface-card__heading"><div><h2>Export a report</h2><p>Export options will be enabled after the reports API is connected.</p></div></div><div className="export-actions"><button className="button button--outline" disabled><FileText size={16} />PDF</button><button className="button button--outline" disabled><FileSpreadsheet size={16} />Excel</button><button className="button button--outline" disabled><Download size={16} />Download</button></div></div>
    </section>
  );
}
