import { useMemo, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import PageHeading from "../components/PageHeading";
import PreviewNotice from "../components/PreviewNotice";
import "./../css/OperationsPages.css";

type TaskState = "Pending" | "Ongoing" | "Completed";
type Task = { title: string; department: string; assignee: string; due: string; state: TaskState; color: string };
const initialTasks: Task[] = [
  { title: "Restock drinks inventory", department: "Bar", assignee: "John Mensah", due: "Today · 2:00 PM", state: "Pending", color: "red" },
  { title: "Clean storage room", department: "Inventory", assignee: "David Wilson", due: "Today · 4:00 PM", state: "Ongoing", color: "amber" },
  { title: "Prepare daily sales report", department: "Management", assignee: "Blessing Udo", due: "Today · 5:00 PM", state: "Ongoing", color: "orange" },
  { title: "Fix refrigerator", department: "Maintenance", assignee: "Tunde Adebayo", due: "Tomorrow", state: "Pending", color: "blue" },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const visible = useMemo(() => tasks.filter((task) => filter === "All" || task.state === filter), [filter, tasks]);
  return (
    <section className="module-page">
      <PageHeading title="Tasks" description="Create and track work assigned to staff and departments." action={{ label: "New Task", onClick: () => setShowForm(true) }} />
      <PreviewNotice />
      <div className="tab-strip">{["All", "Pending", "Ongoing", "Completed"].map((tab) => <button className={`tab-chip${filter === tab ? " tab-chip--active" : ""}`} key={tab} onClick={() => setFilter(tab)}>{tab}</button>)}</div>
      <div className="surface-card record-list">
        {visible.map((task) => <button className="record-row record-row--button task-row" key={task.title} onClick={() => setTasks((current) => current.map((item) => item.title === task.title ? { ...item, state: item.state === "Pending" ? "Ongoing" : item.state === "Ongoing" ? "Completed" : "Pending" } : item))}><span className={`task-icon task-icon--${task.color}`}><ClipboardList size={17} /></span><span className="record-row__main"><strong>{task.title}</strong><small>{task.department} · Due {task.due}<br />Assigned to {task.assignee}</small></span><span className={`status-pill${task.state === "Pending" ? " status-pill--warning" : task.state === "Completed" ? "" : " status-pill--neutral"}`}>{task.state}</span></button>)}
      </div>
      {showForm && <div className="preview-modal"><section className="preview-modal__body" role="dialog" aria-modal="true"><div className="preview-modal__heading"><h2>Create task</h2><button className="preview-modal__close" onClick={() => setShowForm(false)}>×</button></div><form className="form-card" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const title = String(data.get("title") ?? "").trim(); if (title) setTasks((current) => [{ title, department: String(data.get("department") ?? "Bar"), assignee: "Unassigned", due: "Not set", state: "Pending", color: "blue" }, ...current]); setShowForm(false); }}><label>Task name<input name="title" required /></label><label>Assign department<select name="department"><option>Bar</option><option>Inventory</option><option>Management</option><option>Maintenance</option></select></label><label>Due date<input type="date" /></label><div className="form-actions"><button className="button button--outline" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button button--primary" type="submit"><Plus size={15} /> Add to preview</button></div></form></section></div>}
    </section>
  );
}
