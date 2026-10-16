import { useEffect, useState } from "react";
import { Bell, Check, ChevronRight, Clock3, MapPin, ShieldCheck, SlidersHorizontal, UsersRound } from "lucide-react";
import { apiRequest } from "../lib/api";
import PageHeading from "../components/PageHeading";
import PreviewNotice from "../components/PreviewNotice";
import "./../css/OperationsPages.css";

type SettingsSection = "menu" | "location" | "roles" | "notifications" | "activity" | "system";

interface LocationSettings {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  timezone: string;
  configured: boolean;
}

export default function SettingsPage({
  canManage = false,
  onManageUsers,
}: {
  canManage?: boolean;
  onManageUsers?: () => void;
}) {
  const [section, setSection] = useState<SettingsSection>("menu");
  const [coordinates, setCoordinates] = useState("");
  const [radius, setRadius] = useState("100");
  const [timezone, setTimezone] = useState("Africa/Lagos");
  const [notice, setNotice] = useState("");
  const [locationError, setLocationError] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  useEffect(() => {
    if (section !== "location") return;
    let mounted = true;
    void apiRequest<LocationSettings>("/api/v1/attendance/config")
      .then((settings) => {
        if (!mounted) return;
        if (settings.configured && settings.latitude !== null && settings.longitude !== null) {
          setCoordinates(`${settings.latitude}, ${settings.longitude}`);
        }
        setRadius(String(settings.radiusMeters));
        setTimezone(settings.timezone);
      })
      .catch((error: unknown) => {
        if (mounted) setLocationError(error instanceof Error ? error.message : "We couldn't load the business location.");
      });
    return () => { mounted = false; };
  }, [section]);

  function detectLocation() {
    setNotice("");
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Location is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setCoordinates(`${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`),
      () => setLocationError("Location access was denied or could not be detected."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function saveLocation() {
    setLocationError("");
    setNotice("");
    const [latitude, longitude] = coordinates.split(",").map((value) => Number(value.trim()));
    const radiusMeters = Number(radius);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setLocationError("Enter a valid latitude and longitude.");
      return;
    }
    setSavingLocation(true);
    try {
      const result = await apiRequest<{ message: string }>("/api/v1/attendance/config", {
        method: "PUT",
        body: JSON.stringify({ latitude, longitude, radiusMeters, timezone }),
      });
      setNotice(result.message);
    } catch (error: unknown) {
      setLocationError(error instanceof Error ? error.message : "We couldn't save the business location.");
    } finally {
      setSavingLocation(false);
    }
  }

  return (
    <section className="module-page">
      <PageHeading title={section === "menu" ? "Settings" : settingTitle(section)} description={section === "menu" ? "Security, access and business configuration." : "Flex Bar system configuration."} />
      {section !== "location" && section !== "roles" && <PreviewNotice />}
      {section !== "menu" && <button className="icon-link" onClick={() => setSection("menu")}>← Back to settings</button>}
      {section === "menu" && (
        <div className="surface-card settings-list">
          <button className="settings-row" onClick={() => setSection("location")}><span className="settings-row__icon"><MapPin size={17} /></span><span><strong>Business Location / Geofence</strong><small>Set the approved attendance location</small></span><ChevronRight size={16} /></button>
          <button className="settings-row" onClick={() => setSection("roles")}><span className="settings-row__icon"><UsersRound size={17} /></span><span><strong>Roles &amp; Permissions</strong><small>Manage access by role</small></span><ChevronRight size={16} /></button>
          <button className="settings-row" onClick={() => setSection("notifications")}><span className="settings-row__icon"><Bell size={17} /></span><span><strong>Notifications</strong><small>Manage alert preferences</small></span><ChevronRight size={16} /></button>
          <button className="settings-row" onClick={() => setSection("activity")}><span className="settings-row__icon"><Clock3 size={17} /></span><span><strong>Activity Log</strong><small>Review important account activity</small></span><ChevronRight size={16} /></button>
          <button className="settings-row" onClick={() => setSection("system")}><span className="settings-row__icon"><SlidersHorizontal size={17} /></span><span><strong>System Settings</strong><small>General application preferences</small></span><ChevronRight size={16} /></button>
        </div>
      )}
      {section === "location" && (
        <>
          <div className="map-preview map-preview--settings"><div className="map-preview__grid" /><span className="map-preview__pin"><MapPin size={23} fill="currentColor" /></span><span className="map-preview__ring" /></div>
          <div className="surface-card form-card"><h2>Business Location / Geofence</h2><p className="form-help">{canManage ? "Set the approved location and radius used to validate staff and management check-ins." : "Attendance is validated against the super-admin approved location."}</p>{canManage && <button className="button button--outline" onClick={detectLocation}><MapPin size={16} /> Use this device's location</button>}<label>Latitude, longitude<input value={coordinates} onChange={(event) => setCoordinates(event.target.value)} placeholder="e.g. 6.000000, 3.000000" readOnly={!canManage} /></label><label>Geofence radius (metres)<input type="number" min="25" max="2000" value={radius} onChange={(event) => setRadius(event.target.value)} readOnly={!canManage} /></label><label>Business timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)} disabled={!canManage}><option value="Africa/Lagos">Africa/Lagos</option><option value="UTC">UTC</option></select></label>{locationError && <p className="inline-error" role="alert">{locationError}</p>}{notice && <div className="alert alert--success" role="status">{notice}</div>}{canManage && <button className="button button--primary" onClick={() => void saveLocation()} disabled={!coordinates || savingLocation}><Check size={15} />{savingLocation ? "Saving…" : "Save business location"}</button>}</div>
        </>
      )}
      {section === "roles" && <div className="surface-card"><div className="surface-card__heading"><h2>Access roles</h2><span className="status-pill status-pill--neutral">API protected</span></div>{["Super Admin", "Management Admin", "Department Supervisor", "Inventory Officer", "Cash & Sales Officer", "Staff"].map((role) => <div className="record-row" key={role}><span className="settings-row__icon"><ShieldCheck size={16} /></span><span className="record-row__main"><strong>{role}</strong><small>Role assignment is enforced by the server.</small></span></div>)}<p className="form-help">Assign staff roles and departments from user management. The primary super-admin account cannot be demoted there.</p>{canManage && onManageUsers && <button className="button button--outline" onClick={onManageUsers}><UsersRound size={16} /> Manage users and roles</button>}</div>}
      {section === "notifications" && <div className="surface-card settings-list">{["Task assignments", "Low stock alerts", "Sales updates", "New messages"].map((label) => <label className="toggle-row" key={label}><span>{label}</span><input type="checkbox" defaultChecked /></label>)}</div>}
      {section === "activity" && <div className="surface-card record-list"><div className="record-row"><span className="settings-row__icon"><Clock3 size={16} /></span><span className="record-row__main"><strong>Signed in to Flex Bar</strong><small>Current session · sample activity</small></span></div><p className="form-help">Audit events are not connected in this preview.</p></div>}
      {section === "system" && <div className="surface-card form-card"><h2>System preferences</h2><p className="form-help">Business hours, currency, data retention and timezone will be configured here.</p><label>Display currency<select defaultValue="NGN"><option value="NGN">Nigerian Naira (₦)</option></select></label><label>Timezone<select defaultValue="Africa/Lagos"><option value="Africa/Lagos">Africa/Lagos</option></select></label></div>}
    </section>
  );
}

function settingTitle(section: SettingsSection): string {
  const titles: Record<SettingsSection, string> = {
    menu: "Settings",
    location: "Business Location / Geofence",
    roles: "Roles & Permissions",
    notifications: "Notifications",
    activity: "Activity Log",
    system: "System Settings",
  };
  return titles[section];
}
