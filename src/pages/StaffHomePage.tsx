import { CalendarCheck, ClipboardList, MessageCircle, Clock3 } from "lucide-react";
import type { DashboardSection } from "../components/DashboardSidebar";
import PreviewNotice from "../components/PreviewNotice";
import "./../css/OperationsPages.css";

export default function StaffHomePage({
  name,
  onNavigate,
}: {
  name: string;
  onNavigate: (section: DashboardSection) => void;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <section className="module-page staff-home">
      <div className="staff-home__welcome">
        <p className="eyebrow">YOUR FLEX BAR WORKSPACE</p>
        <h1>{greeting}, {name}.</h1>
        <p>Here’s what’s happening with your shift.</p>
      </div>
      <PreviewNotice />
      <div className="staff-hero"><div><span className="welcome-banner__overline">MY SHIFT</span><h2>Today’s overview</h2><p>Check your attendance and assigned tasks.</p></div><span className="staff-hero__icon"><CalendarCheck size={27} /></span></div>
      <div className="metric-grid">
        <div className="metric-card"><small>My sales · sample</small><strong>₦82,500</strong><span className="metric-trend">Preview only</span></div>
        <div className="metric-card metric-card--red"><small>Pending tasks</small><strong>3</strong><span className="metric-trend">Sample count</span></div>
      </div>
      <button className="surface-card staff-attendance-card" onClick={() => onNavigate("Attendance")}><span className="staff-attendance-card__icon"><Clock3 size={19} /></span><span><strong>Attendance</strong><small>View check-in and history</small></span><span className="status-pill status-pill--neutral">Check status</span></button>
      <div className="staff-quick-grid">
        <button onClick={() => onNavigate("Tasks")}><ClipboardList size={20} /><span>My tasks</span></button>
        <button onClick={() => onNavigate("Chat")}><MessageCircle size={20} /><span>Team chat</span></button>
        <button onClick={() => onNavigate("Attendance")}><CalendarCheck size={20} /><span>Attendance</span></button>
      </div>
    </section>
  );
}
