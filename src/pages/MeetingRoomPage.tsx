import { useCallback, useEffect, useState } from "react";
import { CalendarDays, MapPin, RefreshCw, Video, Zap } from "lucide-react";
import { apiRequest, type CurrentUser } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import PageHeading from "../components/PageHeading";
import MeetingCallRoom from "./MeetingCallRoom";
import "./../css/OperationsPages.css";

interface DepartmentMeeting {
  id: string;
  departmentId: string | null;
  departmentName: string;
  title: string;
  agenda: string;
  startsAt: string;
  isInstant: boolean;
  location: string | null;
  createdByName: string;
  createdAt: string;
}

interface MeetingDepartment {
  id: string;
  name: string;
}

export default function MeetingRoomPage({ user }: { user: CurrentUser }) {
  const { showToast } = useToast();
  const [meetings, setMeetings] = useState<DepartmentMeeting[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [departments, setDepartments] = useState<MeetingDepartment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [meetingMode, setMeetingMode] = useState<"instant" | "scheduled">("instant");
  const [selected, setSelected] = useState<DepartmentMeeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<{
        meetings: DepartmentMeeting[];
        canCreate: boolean;
        isAdmin: boolean;
        departments: MeetingDepartment[];
      }>("/api/v1/department/meetings");
      setMeetings(result.meetings);
      setCanCreate(result.canCreate);
      setIsAdmin(result.isAdmin);
      setDepartments(result.departments);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't load department meetings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadMeetings(); }, [loadMeetings]);

  async function createMeeting(form: HTMLFormElement) {
    const values = new FormData(form);
    const title = String(values.get("title") ?? "").trim();
    const agenda = String(values.get("agenda") ?? "").trim();
    const startsAt = String(values.get("startsAt") ?? "");
    const location = String(values.get("location") ?? "").trim();
    const departmentId = String(values.get("departmentId") ?? "");
    const isInstant = meetingMode === "instant";
    if (!title || (!isInstant && (!agenda || !startsAt))) {
      showToast(isInstant ? "Enter a meeting title." : "Enter a meeting title, agenda and start time.", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<{ meeting: DepartmentMeeting; message: string }>("/api/v1/department/meetings", {
        method: "POST",
        body: JSON.stringify({
          title,
          agenda: agenda || "Instant department meeting",
          ...(isInstant ? { instant: true } : { startsAt: new Date(startsAt).toISOString() }),
          location,
          ...(isAdmin ? { departmentId: departmentId || "all" } : {}),
        }),
      });
      showToast(result.message, "success");
      setShowForm(false);
      setMeetingMode("instant");
      form.reset();
      setMeetings((current) => [result.meeting, ...current.filter((meeting) => meeting.id !== result.meeting.id)]
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt)));
      if (isInstant) setSelected(result.meeting);
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't create this meeting.", "error");
    } finally {
      setSaving(false);
    }
  }

  function meetingDate(value: string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(new Date(value));
  }

  return (
    <section className="module-page">
      <PageHeading
        title={selected?.title ?? "Department meetings"}
        description={selected ? `${selected.departmentName} · ${meetingDate(selected.startsAt)}` : "Schedule team meetings and join live department voice or video calls."}
        action={!selected && canCreate ? {
          label: showForm ? "Close form" : "Start instant meeting",
          onClick: () => {
            if (showForm && meetingMode === "instant") {
              setShowForm(false);
            } else {
              setMeetingMode("instant");
              setShowForm(true);
            }
          },
        } : undefined}
      />
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {selected ? (
        <article className="surface-card post-detail">
          <button className="icon-link" type="button" onClick={() => setSelected(null)}>← Back to meetings</button>
          <span className="task-icon task-icon--blue"><Video size={18} /></span>
          <span className="status-pill status-pill--neutral">{selected.departmentName}</span>
          <h2>{selected.title}</h2>
          <p>{selected.agenda}</p>
          {selected.location && <p><MapPin size={15} /> {selected.location}</p>}
          <small>Organized by {selected.createdByName} · {meetingDate(selected.startsAt)}</small>
          <div className="meeting-detail__call">
            <p><strong>Live meeting</strong> · Join with your microphone, then turn your camera on or off or share your screen. Administrators can join this and every department meeting; they appear in the participant list and start muted.</p>
            <MeetingCallRoom meeting={selected} user={user} />
          </div>
        </article>
      ) : (
        <>
          {canCreate && showForm && (
            <div className="surface-card">
              <form className="form-card" onSubmit={(event) => { event.preventDefault(); void createMeeting(event.currentTarget); }}>
                <div className="surface-card__heading"><div><h2>{meetingMode === "instant" ? "Start an instant meeting" : "Schedule a meeting"}</h2><p>{isAdmin ? "Choose a department. All administrators can join every department meeting." : "Your department and all administrators can access this meeting."}</p></div></div>
                <div className="tab-strip" aria-label="Meeting start time">
                  <button className={`tab-chip${meetingMode === "instant" ? " tab-chip--active" : ""}`} type="button" onClick={() => setMeetingMode("instant")}><Zap size={14} /> Start now</button>
                  <button className={`tab-chip${meetingMode === "scheduled" ? " tab-chip--active" : ""}`} type="button" onClick={() => setMeetingMode("scheduled")}><CalendarDays size={14} /> Schedule</button>
                </div>
                {isAdmin && <label>Meeting audience<select name="departmentId" required defaultValue=""><option value="" disabled>Choose who can join</option><option value="all">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>}
                <label>Meeting title<input name="title" required minLength={3} maxLength={120} placeholder={meetingMode === "instant" ? "e.g. Quick team briefing" : "e.g. Weekly department briefing"} /></label>
                <label>Agenda {meetingMode === "instant" && <span className="muted-copy">Optional</span>}<textarea name="agenda" required={meetingMode === "scheduled"} minLength={meetingMode === "scheduled" ? 3 : undefined} maxLength={2000} placeholder="What should the team discuss?" /></label>
                {meetingMode === "scheduled" && <label>Date and time<input name="startsAt" type="datetime-local" required min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)} /></label>}
                {meetingMode === "scheduled" && <label>Location (optional)<input name="location" maxLength={160} placeholder="Meeting room or online link" /></label>}
                <div className="form-actions">
                  <button className="button button--outline" type="button" disabled={saving} onClick={() => setShowForm(false)}>Cancel</button>
                  <button className="button button--primary" type="submit" disabled={saving}>{saving ? (meetingMode === "instant" ? "Starting…" : "Scheduling…") : meetingMode === "instant" ? "Start meeting now" : "Schedule meeting"}</button>
                </div>
              </form>
            </div>
          )}
          <div className="surface-card">
            <div className="surface-card__heading">
              <div><h2>Live and upcoming meetings</h2><p>{isAdmin ? "Instant and scheduled meetings across all departments. Administrators can join every call." : "Instant and scheduled meetings for your department."}</p></div>
              <button className="button button--outline" type="button" onClick={() => void loadMeetings()} disabled={loading}><RefreshCw size={14} /> Refresh</button>
            </div>
            {loading ? <p className="empty-state">Loading meetings…</p> : meetings.length === 0 ? <p className="empty-state">No live or upcoming meetings.</p> : (
              <div className="meeting-list">{meetings.map((meeting) => <article className="surface-card meeting-card" key={meeting.id}>
                <span className="task-icon task-icon--blue"><Video size={18} /></span>
                <div className="meeting-card__content">
                  <div className="meeting-card__top"><strong>{meeting.title}</strong><small>{meeting.isInstant ? "Instant meeting · " : ""}{meetingDate(meeting.startsAt)}</small></div>
                  <p>{meeting.departmentName} · {meeting.agenda}</p>
                  <button className="icon-link" type="button" onClick={() => setSelected(meeting)}><CalendarDays size={14} /> View meeting and join call</button>
                </div>
              </article>)}</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
