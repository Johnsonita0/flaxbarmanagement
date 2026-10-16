import { useState } from "react";
import { Bell, CircleCheck, Package, ClipboardList, MessageCircle } from "lucide-react";
import PageHeading from "../components/PageHeading";
import PreviewNotice from "../components/PreviewNotice";
import "./../css/OperationsPages.css";

const items = [
  { type: "System", title: "New task assigned", detail: "You have been assigned a new task", time: "2h ago", icon: ClipboardList, style: "amber" },
  { type: "System", title: "Low stock alert", detail: "Chips are running low (12 left)", time: "4h ago", icon: Package, style: "orange" },
  { type: "System", title: "Sales target achieved", detail: "Daily sales target reached", time: "5h ago", icon: CircleCheck, style: "green" },
  { type: "Messages", title: "New message", detail: "From: Management", time: "1d ago", icon: MessageCircle, style: "blue" },
];

export default function NotificationsPage() {
  const [filter, setFilter] = useState("All");
  const visible = items.filter((item) => filter === "All" || item.type === filter);
  return (
    <section className="module-page">
      <PageHeading title="Notifications" description="Important updates about work and operations." />
      <PreviewNotice />
      <div className="tab-strip">{["All", "System", "Messages"].map((tab) => <button className={`tab-chip${filter === tab ? " tab-chip--active" : ""}`} key={tab} onClick={() => setFilter(tab)}>{tab}</button>)}</div>
      <div className="surface-card record-list">{visible.map(({ type, title, detail, time, icon: Icon, style }) => <div className="record-row" key={title}><span className={`task-icon task-icon--${style}`}><Icon size={17} /></span><span className="record-row__main"><strong>{title}</strong><small>{type} · {detail}</small></span><span className="record-row__meta">{time}</span></div>)}</div>
      {visible.length === 0 && <div className="surface-card empty-state">No notifications in this category.</div>}
      <button className="icon-link"><Bell size={14} /> Notification preferences</button>
    </section>
  );
}
