import { useEffect, useState } from "react";
import { CalendarCheck, ClipboardList, MessageCircle, Clock3, Package, ShoppingCart } from "lucide-react";
import { apiRequest } from "../lib/api";
import type { DashboardSection } from "../components/DashboardSidebar";
import "./../css/OperationsPages.css";

interface AttendanceConfig {
  timezone: string;
}

interface AttendanceRecord {
  date: string;
  clockIn: string;
  clockOut: string | null;
}

function businessDate(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map(({ type, value }) => [type, value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function StaffHomePage({
  name,
  userId,
  salesEnabled,
  onNavigate,
}: {
  name: string;
  userId: string;
  salesEnabled: boolean;
  onNavigate: (section: DashboardSection) => void;
}) {
  const [shiftStartedAt, setShiftStartedAt] = useState<number | null>(null);
  const [shiftStatus, setShiftStatus] = useState<"loading" | "active" | "off" | "error">("loading");
  const [now, setNow] = useState(Date.now());
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<AttendanceConfig>("/api/v1/attendance/config"),
      apiRequest<{ records: AttendanceRecord[] }>("/api/v1/attendance/records"),
    ]).then(([config, result]) => {
      if (!active) return;
      const today = businessDate(config.timezone);
      const currentShift = result.records.find((record) => record.date === today && !record.clockOut);
      setShiftStartedAt(currentShift ? new Date(currentShift.clockIn).getTime() : null);
      setShiftStatus(currentShift ? "active" : "off");
    }).catch(() => {
      if (active) setShiftStatus("error");
    });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (shiftStatus !== "active") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [shiftStatus]);

  const elapsedSeconds = shiftStartedAt === null ? 0 : Math.max(0, Math.floor((now - shiftStartedAt) / 1000));

  return (
    <section className="module-page staff-home">
      <div className="staff-home__welcome">
        <p className="eyebrow">YOUR FLEX BAR WORKSPACE</p>
        <h1>{greeting}, {name}.</h1>
        <p>Here’s what’s happening with your shift.</p>
      </div>
      <div className="staff-hero"><div><span className="welcome-banner__overline">MY SHIFT</span><h2>Today’s overview</h2><p>Check your attendance and assigned tasks.</p></div><span className="staff-hero__icon"><CalendarCheck size={27} /></span></div>
      <div className="staff-shift-counter" aria-live="polite">
        <span className={`staff-shift-counter__icon${shiftStatus === "active" ? " staff-shift-counter__icon--active" : ""}`}><Clock3 size={19} /></span>
        <div className="staff-shift-counter__details">
          <small>SHIFT TIME</small>
          <strong>{shiftStatus === "active" ? formatDuration(elapsedSeconds) : shiftStatus === "loading" ? "Checking…" : "--:--:--"}</strong>
          <span>{shiftStatus === "active" ? "Elapsed since clock-in" : shiftStatus === "off" ? "No active shift today" : shiftStatus === "error" ? "Shift time unavailable" : "Loading attendance"}</span>
        </div>
        <button className="button button--outline" type="button" onClick={() => onNavigate("Attendance")}>
          {shiftStatus === "active" ? "View attendance" : "Clock in"}
        </button>
      </div>
      <button className="surface-card staff-attendance-card" onClick={() => onNavigate("Attendance")}><span className="staff-attendance-card__icon"><Clock3 size={19} /></span><span><strong>Attendance</strong><small>View check-in and history</small></span><span className="status-pill status-pill--neutral">Check status</span></button>
      <div className="staff-quick-grid">
        <button onClick={() => onNavigate("Tasks")}><ClipboardList size={20} /><span>My tasks</span></button>
        <button onClick={() => onNavigate("Chat")}><MessageCircle size={20} /><span>Team chat</span></button>
        <button onClick={() => onNavigate("Attendance")}><CalendarCheck size={20} /><span>Attendance</span></button>
        {salesEnabled && <button onClick={() => onNavigate("Sales")}><ShoppingCart size={20} /><span>New sale</span></button>}
        <button onClick={() => onNavigate("Stock Movement")}><Package size={20} /><span>Shift handover</span></button>
      </div>
    </section>
  );
}
