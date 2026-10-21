import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Camera, CheckCircle2, Clock3, MapPin, QrCode } from "lucide-react";
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
  userId: string | null;
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
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number; accuracyMeters: number } | null>(null);
  const [qrToken, setQrToken] = useState("");
  const [scanningQr, setScanningQr] = useState(false);
  const [qrError, setQrError] = useState("");
  const [config, setConfig] = useState<AttendanceConfig | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const locationWatchRef = useRef<number | null>(null);
  const locationTimeoutRef = useRef<number | null>(null);
  const bestLocationRef = useRef<{ latitude: number; longitude: number; accuracyMeters: number } | null>(null);

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

  useEffect(() => () => {
    scannerControlsRef.current?.stop();
    if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current);
    if (locationTimeoutRef.current !== null) window.clearTimeout(locationTimeoutRef.current);
  }, []);

  function locate() {
    if (!navigator.geolocation) {
      setGeoState("error");
      return;
    }
    if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current);
    if (locationTimeoutRef.current !== null) window.clearTimeout(locationTimeoutRef.current);
    bestLocationRef.current = null;
    setGeoState("loading");
    setCoordinates(null);
    const finishLocationWatch = () => {
      if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current);
      if (locationTimeoutRef.current !== null) window.clearTimeout(locationTimeoutRef.current);
      locationWatchRef.current = null;
      locationTimeoutRef.current = null;
      setGeoState(bestLocationRef.current ? "found" : "error");
    };
    locationWatchRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const nextLocation = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyMeters: coords.accuracy,
        };
        if (!bestLocationRef.current || nextLocation.accuracyMeters < bestLocationRef.current.accuracyMeters) {
          bestLocationRef.current = nextLocation;
          setCoordinates(nextLocation);
        }
        if (nextLocation.accuracyMeters <= (config?.radiusMeters ?? 25)) finishLocationWatch();
      },
      () => finishLocationWatch(),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
    locationTimeoutRef.current = window.setTimeout(finishLocationWatch, 30000);
  }

  async function startQrScan() {
    const video = scannerVideoRef.current;
    if (!video) return;
    setQrError("");
    setQrToken("");
    setScanningQr(true);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      scannerControlsRef.current = await reader.decodeFromVideoDevice(undefined, video, (result, _error, controls) => {
        if (!result) return;
        const token = result.getText();
        if (!token.startsWith("flexbar-attendance:")) {
          setQrError("That is not a Flex Bar attendance QR code. Scan the code displayed in the business.");
          return;
        }
        controls.stop();
        scannerControlsRef.current = null;
        setScanningQr(false);
        setQrToken(token);
        setQrError("");
      });
    } catch (error: unknown) {
      console.error("Could not start the attendance QR scanner.", error);
      setScanningQr(false);
      setQrError(error instanceof Error ? error.message : "Camera access failed. Allow camera permission and try again.");
    }
  }

  function stopQrScan() {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setScanningQr(false);
  }

  const currentDate = config ? businessDate(config.timezone) : "";
  const todaysRecord = records.find((record) => record.date === currentDate);
  const gpsAccuracyReady = Boolean(coordinates && coordinates.accuracyMeters <= (config?.radiusMeters ?? 25));

  async function clock(action: "clock-in" | "clock-out") {
    if (!coordinates || !gpsAccuracyReady) {
      showToast("Check your location again while you are at the business.", "error");
      return;
    }
    if (!qrToken) {
      showToast("Scan the current on-site attendance QR code before recording attendance.", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<{ message: string }>(`/api/v1/attendance/${action}`, {
        method: "POST",
        body: JSON.stringify({ ...coordinates, qrToken }),
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
          <div className="location-status"><MapPin size={17} /><div><strong>{config?.configured ? "Business attendance area is ready" : "Business location not configured"}</strong><small>{coordinates ? `Your location must be verified within the ${config?.radiusMeters ?? 25} m attendance area.` : config?.configured ? "Attendance is restricted to a 25-metre area around the approved location." : "Ask the super admin to set the business location before clock-in."}</small></div></div>
          {geoState === "error" && <p className="inline-error" role="alert">Location could not be read. Allow location access and try again.</p>}
          <button className="button button--outline location-button" onClick={locate} disabled={geoState === "loading" || loading}>{geoState === "loading" ? coordinates ? `Improving GPS accuracy… ${Math.ceil(coordinates.accuracyMeters)} m` : "Finding precise location…" : "Check my location"}</button>
          <div className="attendance-qr-check">
            <div className="attendance-qr-check__heading"><QrCode size={18} /><div><strong>Scan the on-site check-in code</strong><small>The code must be displayed inside the business and refreshes every 30 seconds.</small></div></div>
            <video className="attendance-qr-check__video" ref={scannerVideoRef} hidden={!scanningQr} muted playsInline aria-label="Camera scanning the on-site attendance QR code" />
            {qrError && <p className="inline-error" role="alert">{qrError}</p>}
            {qrToken && <p className="attendance-qr-check__verified" role="status"><CheckCircle2 size={15} /> Current on-site code scanned</p>}
            {scanningQr
              ? <button className="button button--outline" type="button" onClick={stopQrScan}>Stop scanning</button>
              : <button className="button button--outline" type="button" onClick={() => void startQrScan()} disabled={!config?.configured || loading}><Camera size={16} />{qrToken ? "Scan code again" : "Scan QR code"}</button>}
          </div>
          {todaysRecord?.clockOut ? (
            <button className="button button--primary checkin-button" disabled><CheckCircle2 size={16} /> Shift complete</button>
          ) : todaysRecord ? (
            <button className="button button--primary checkin-button" onClick={() => void clock("clock-out")} disabled={!config?.configured || !gpsAccuracyReady || !qrToken || saving}><Clock3 size={16} /> {saving ? "Recording…" : "Clock Out"}</button>
          ) : (
            <button className="button button--primary checkin-button" onClick={() => void clock("clock-in")} disabled={loading || !config?.configured || !gpsAccuracyReady || !qrToken || saving}><Clock3 size={16} /> {saving ? "Recording…" : "Clock In"}</button>
          )}
          <div className="secure-note"><CheckCircle2 size={15} /> Attendance is recorded only when your location is verified inside the 25-metre geofence and the rotating on-site QR code is valid.</div>
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
