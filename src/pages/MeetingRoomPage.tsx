import { useCallback, useEffect, useState } from "react";
import { CalendarDays, MapPin, RefreshCw, Video } from "lucide-react";
import { apiRequest, type CurrentUser } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import PageHeading from "../components/PageHeading";
import MeetingCallRoom from "./MeetingCallRoom";
import "./../css/OperationsPages.css";

interface DepartmentMeeting {
  id: string;
  departmentId: string;
  departmentName: string;
  title: string;
  agenda: string;
  startsAt: string;
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

  async function scheduleMeeting(form: HTMLFormElement) {
    const values = new FormData(form);
    const title = String(values.get("title") ?? "").trim();
    const agenda = String(values.get("agenda") ?? "").trim();
    const startsAt = String(values.get("startsAt") ?? "");
    const location = String(values.get("location") ?? "").trim();
    const departmentId = String(values.get("departmentId") ?? "");
    if (!title || !agenda || !startsAt) {
      showToast("Enter a meeting title, agenda and start time.", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<{ message: string }>("/api/v1/department/meetings", {
        method: "POST",
        body: JSON.stringify({
          title,
          agenda,
          startsAt: new Date(startsAt).toISOString(),
          location,
          ...(isAdmin ? { departmentId } : {}),
        }),
      });
      showToast(result.message, "success");
      setShowForm(false);
      form.reset();
      await loadMeetings();
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't schedule this meeting.", "error");
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
        action={!selected && canCreate ? { label: showForm ? "Close form" : "Schedule meeting", onClick: () => setShowForm((open) => !open) } : undefined}
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
              <form className="form-card" onSubmit={(event) => { event.preventDefault(); void scheduleMeeting(event.currentTarget); }}>
                <div className="surface-card__heading"><div><h2>Schedule a meeting</h2><p>{isAdmin ? "Choose a department. All administrators can join every scheduled meeting." : "Your department and all administrators can access this meeting."}</p></div></div>
                {isAdmin && <label>Department<select name="departmentId" required defaultValue=""><option value="" disabled>Choose a department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>}
                <label>Meeting title<input name="title" required minLength={3} maxLength={120} placeholder="e.g. Weekly department briefing" /></label>
                <label>Agenda<textarea name="agenda" required minLength={3} maxLength={2000} placeholder="What should the team discuss?" /></label>
                <label>Date and time<input name="startsAt" type="datetime-local" required min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)} /></label>
                <label>Location (optional)<input name="location" maxLength={160} placeholder="Meeting room or online link" /></label>
                <div className="form-actions">
                  <button className="button button--outline" type="button" disabled={saving} onClick={() => setShowForm(false)}>Cancel</button>
                  <button className="button button--primary" type="submit" disabled={saving}>{saving ? "Scheduling…" : "Schedule meeting"}</button>
                </div>
              </form>
            </div>
          )}
          <div className="surface-card">
            <div className="surface-card__heading">
              <div><h2>Scheduled meetings</h2><p>{isAdmin ? "Upcoming meetings across all departments. Administrators can join every call." : "Your department's upcoming meetings. Administrators can join every call."}</p></div>
              <button className="button button--outline" type="button" onClick={() => void loadMeetings()} disabled={loading}><RefreshCw size={14} /> Refresh</button>
            </div>
            {loading ? <p className="empty-state">Loading meetings…</p> : meetings.length === 0 ? <p className="empty-state">No meetings have been scheduled.</p> : (
              <div className="meeting-list">{meetings.map((meeting) => <article className="surface-card meeting-card" key={meeting.id}>
                <span className="task-icon task-icon--blue"><Video size={18} /></span>
                <div className="meeting-card__content">
                  <div className="meeting-card__top"><strong>{meeting.title}</strong><small>{meetingDate(meeting.startsAt)}</small></div>
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
