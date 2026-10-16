import { useState } from "react";
import { CalendarDays, MessageCircle, Megaphone } from "lucide-react";
import PageHeading from "../components/PageHeading";
import PreviewNotice from "../components/PreviewNotice";
import "./../css/OperationsPages.css";

const posts = [
  { title: "Management Meeting", type: "Meeting", date: "Today, 10:00 AM", body: "All staff are invited to today's management meeting to review operations.", color: "red" },
  { title: "Company Announcement", type: "Announcement", date: "Oct 28, 2026", body: "New bar procedures are now available for all staff. Keep up the great work!", color: "amber" },
  { title: "Weekend Operations Briefing", type: "Discussion", date: "Oct 26, 2026", body: "Share important updates before the weekend shift.", color: "blue" },
];

export default function MeetingRoomPage() {
  const [tab, setTab] = useState("Announcements");
  const [selected, setSelected] = useState<(typeof posts)[number] | null>(null);
  const filtered = posts.filter((post) => tab === "Announcements" ? post.type === "Announcement" || post.type === "Meeting" : tab === "Meetings" ? post.type === "Meeting" : true);
  return (
    <section className="module-page">
      <PageHeading title={selected?.title ?? "Meeting Room"} description={selected ? selected.date : "Team announcements, meetings and operational discussions."} />
      <PreviewNotice />
      {selected ? (
        <article className="surface-card post-detail"><button className="icon-link" onClick={() => setSelected(null)}>← Back to Meeting Room</button><span className={`task-icon task-icon--${selected.color}`}><Megaphone size={18} /></span><span className="status-pill status-pill--neutral">{selected.type}</span><h2>{selected.title}</h2><p>{selected.body}</p><small>Posted by Management · {selected.date}</small></article>
      ) : (
        <>
          <div className="tab-strip">{["Announcements", "Meetings", "Discussions"].map((label) => <button className={`tab-chip${tab === label ? " tab-chip--active" : ""}`} key={label} onClick={() => setTab(label)}>{label}</button>)}</div>
          <div className="meeting-list">{filtered.map((post) => <article className="surface-card meeting-card" key={post.title}><span className={`task-icon task-icon--${post.color}`}>{post.type === "Meeting" ? <CalendarDays size={18} /> : <Megaphone size={18} />}</span><div className="meeting-card__content"><div className="meeting-card__top"><strong>{post.title}</strong><small>{post.date}</small></div><p>{post.body}</p><button className="icon-link" onClick={() => setSelected(post)}>{post.type === "Meeting" ? "View details" : "Read announcement"} <MessageCircle size={14} /></button></div></article>)}</div>
        </>
      )}
    </section>
  );
}
