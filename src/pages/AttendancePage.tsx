import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, MapPin } from "lucide-react";
import { apiRequest } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import PageHeading from "../components/PageHeading";
import "../css/OperationsPages.css";

type GeoState = "idle" | "loading" | "found" | "error";

interface AttendanceConfig {
  configured: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  timezone: string;
}

interface AttendanceRecord {
  id: string;
  userId: string;
  name: string;
  role: string;
  department: string | null;
  date: string;
  clockIn: string;
  clockOut: string | null;
}

interface AttendanceRecordsResponse {
  records: AttendanceRecord[];
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

function localDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function AttendancePage({ canClockIn = true }: { canClockIn?: boolean }) {
  const { showToast } = useToast();
  const [view, setView] = useState<"check-in" | "history">(canClockIn ? "check-in" : "history");
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [config, setConfig] = useState<AttendanceConfig | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [nextConfig, nextRecords] = await Promise.all([
        apiRequest<AttendanceConfig>("/api/v1/attendance/config"),
        apiRequest<AttendanceRecordsResponse>("/api/v1/attendance/records"),
      ]);
      setConfig(nextConfig);
      setRecords(nextRecords.records);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "We couldn't load attendance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  function locate() {
    if (!navigator.geolocation) {
      setGeoState("error");
      return;
    }
    setGeoState("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
        setGeoState("found");
      },
      () => setGeoState("error"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const currentDate = config ? businessDate(config.timezone) : "";
  const todaysRecord = records.find((record) => record.date === currentDate);

  async function clock(action: "clock-in" | "clock-out") {
    if (!coordinates) {
      showToast("Check your location before recording attendance.", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<{ message: string }>(`/api/v1/attendance/${action}`, {
        method: "POST",
        body: JSON.stringify(coordinates),
      });
      showToast(result.message, "success");
      await loadAttendance();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "We couldn't record attendance.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="module-page">
      <PageHeading title="Attendance" description={canClockIn ? "Secure staff check-in and attendance history." : "Review team attendance. Super-admin accounts are excluded from clock-in."} />
      {loadError && <div className="alert alert--error" role="alert">{loadError}</div>}
      {canClockIn && <div className="tab-strip"><button className={`tab-chip${view === "check-in" ? " tab-chip--active" : ""}`} onClick={() => setView("check-in")}>Check-in</button><button className={`tab-chip${view === "history" ? " tab-chip--active" : ""}`} onClick={() => setView("history")}>Attendance History</button></div>}
      {canClockIn && view === "check-in" ? (
        <div className="surface-card attendance-checkin">
          <div className="map-preview" aria-label="Business geofence status">
            <div className="map-preview__grid" />
            <span className="map-preview__pin"><MapPin size={23} fill="currentColor" /></span>
            <span className="map-preview__ring" />
          </div>
          <div className="location-status"><MapPin size={17} /><div><strong>{config?.configured ? "Business attendance area is ready" : "Business location not configured"}</strong><small>{coordinates ? `Your position: ${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}` : config?.configured ? `Clock-in is allowed within ${config.radiusMeters} metres of the approved location.` : "Ask the super admin to set the business location before clock-in."}</small></div></div>
          {geoState === "error" && <p className="inline-error" role="alert">Location could not be read. Allow location access and try again.</p>}
          <button className="button button--outline location-button" onClick={locate} disabled={geoState === "loading" || loading}>{geoState === "loading" ? "Checking location…" : "Check my location"}</button>
          {todaysRecord?.clockOut ? (
            <button className="button button--primary checkin-button" disabled><CheckCircle2 size={16} /> Shift complete</button>
          ) : todaysRecord ? (
            <button className="button button--primary checkin-button" onClick={() => void clock("clock-out")} disabled={!config?.configured || !coordinates || saving}><Clock3 size={16} /> {saving ? "Recording…" : "Clock Out"}</button>
          ) : (
            <button className="button button--primary checkin-button" onClick={() => void clock("clock-in")} disabled={loading || !config?.configured || !coordinates || saving}><Clock3 size={16} /> {saving ? "Recording…" : "Clock In"}</button>
          )}
          <div className="secure-note"><CheckCircle2 size={15} /> Your location is checked against the approved business geofence when attendance is recorded.</div>
        </div>
      ) : (
        <div className="surface-card">
          <div className="surface-card__heading"><div><h2>{canClockIn ? "My attendance" : "Team attendance"}</h2><p>Saved shift records · displayed in your device timezone</p></div><button className="button button--outline" type="button" onClick={() => void loadAttendance()} disabled={loading}>Refresh</button></div>
          {loading ? <p className="empty-state">Loading attendance records…</p> : records.length === 0 ? <p className="empty-state">No attendance records yet.</p> : (
            <div className="record-list">{records.map((record) => <div className="record-row" key={record.id}><span className="record-date-icon"><CalendarMark /></span><span className="record-row__main"><strong>{record.name}{!canClockIn && record.department ? ` · ${record.department}` : ""}</strong><small>{record.date} · In {localDateTime(record.clockIn)} · Out {localDateTime(record.clockOut)}</small></span><span className={`status-pill${record.clockOut ? "" : " status-pill--warning"}`}>{record.clockOut ? "Complete" : "On shift"}</span></div>)}</div>
          )}
        </div>
      )}
    </section>
  );
}

function CalendarMark() {
  return <span className="calendar-mark">31</span>;
}
