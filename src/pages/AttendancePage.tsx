import { useState } from "react";
import { CheckCircle2, Clock3, MapPin } from "lucide-react";
import PageHeading from "../components/PageHeading";
import PreviewNotice from "../components/PreviewNotice";
import "./../css/OperationsPages.css";

type GeoState = "idle" | "loading" | "found" | "error";

const history = [
  { date: "Today, 8:42 AM", name: "Emeka Okafor", checkIn: "08:42 AM", checkOut: "—", state: "Present" },
  { date: "Yesterday", name: "Blessing Udo", checkIn: "08:57 AM", checkOut: "05:06 PM", state: "Present" },
  { date: "Oct 14", name: "John Mensah", checkIn: "09:18 AM", checkOut: "05:02 PM", state: "Late" },
  { date: "Oct 13", name: "Nengi Eze", checkIn: "—", checkOut: "—", state: "Absent" },
];

export default function AttendancePage() {
  const [view, setView] = useState<"check-in" | "history">("check-in");
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [coordinates, setCoordinates] = useState("");

  function locate() {
    if (!navigator.geolocation) {
      setGeoState("error");
      return;
    }
    setGeoState("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates(`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`);
        setGeoState("found");
      },
      () => setGeoState("error"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <section className="module-page">
      <PageHeading title="Attendance" description="Check-in, check-out and attendance history." />
      <PreviewNotice />
      <div className="tab-strip"><button className={`tab-chip${view === "check-in" ? " tab-chip--active" : ""}`} onClick={() => setView("check-in")}>Check-in</button><button className={`tab-chip${view === "history" ? " tab-chip--active" : ""}`} onClick={() => setView("history")}>Attendance History</button></div>
      {view === "check-in" ? (
        <div className="surface-card attendance-checkin">
          <div className="map-preview" aria-label="Map preview: approved business location has not been configured"><div className="map-preview__grid" /><span className="map-preview__pin"><MapPin size={23} fill="currentColor" /></span><span className="map-preview__ring" /></div>
          <div className="location-status"><MapPin size={17} /><div><strong>Flex Bar location not configured</strong><small>{coordinates ? `Your location: ${coordinates}` : "Your position must be verified against the approved business geofence."}</small></div></div>
          {geoState === "error" && <p className="inline-error" role="alert">Location could not be read. Allow location access and try again.</p>}
          <button className="button button--outline location-button" onClick={locate} disabled={geoState === "loading"}>{geoState === "loading" ? "Checking location…" : "Check my location"}</button>
          <button className="button button--primary checkin-button" disabled title="Configure the approved Flex Bar location before enabling clock-in"><Clock3 size={16} /> Clock In</button>
          <div className="secure-note"><CheckCircle2 size={15} /> Clock-in is disabled until management configures the Flex Bar geofence.</div>
        </div>
      ) : (
        <div className="surface-card">
          <div className="surface-card__heading"><div><h2>Attendance history</h2><p>Recent attendance records · sample preview</p></div><span className="status-pill status-pill--neutral">This week</span></div>
          <div className="record-list">{history.map((record) => <div className="record-row" key={record.date}><span className="record-date-icon"><CalendarMark /></span><span className="record-row__main"><strong>{record.name}</strong><small>{record.date} · In {record.checkIn} · Out {record.checkOut}</small></span><span className={`status-pill${record.state === "Late" || record.state === "Absent" ? " status-pill--warning" : ""}`}>{record.state}</span></div>)}</div>
        </div>
      )}
    </section>
  );
}

function CalendarMark() {
  return <span className="calendar-mark">31</span>;
}
