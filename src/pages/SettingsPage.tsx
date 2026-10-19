import { useEffect, useState } from "react";
import { Bell, Check, ChevronRight, Clock3, MapPin, ShieldCheck, SlidersHorizontal, UsersRound, Volume2 } from "lucide-react";
import { adminRequest, apiRequest } from "../lib/api";
import { getNotificationSoundPreferences, playNotificationTone, saveNotificationSoundPreferences, type NotificationSound, type NotificationSoundPreferences } from "../lib/notificationSounds";
import PageHeading from "../components/PageHeading";
import "../css/OperationsPages.css";

type SettingsSection = "menu" | "location" | "roles" | "notifications" | "sounds" | "activity" | "system";

interface LocationSettings {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  timezone: string;
  configured: boolean;
}

interface NotificationSettings {
  taskAssignments: boolean;
  lowStock: boolean;
  salesUpdates: boolean;
  newMessages: boolean;
}

interface BusinessSettings {
  currency: string;
  timezone: string;
  openingTime: string;
  closingTime: string;
  notifications: NotificationSettings;
}

interface ActivityEntry {
  id: string;
  actorName: string;
  actorEmail: string | null;
  action: string;
  targetLabel: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export default function SettingsPage({
  canManage = false,
  userId,
  onManageUsers,
}: {
  canManage?: boolean;
  userId: string;
  onManageUsers?: () => void;
}) {
  const [section, setSection] = useState<SettingsSection>("menu");
  const [coordinates, setCoordinates] = useState("");
  const [radius, setRadius] = useState("100");
  const [locationTimezone, setLocationTimezone] = useState("Africa/Lagos");
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [soundSettings, setSoundSettings] = useState<NotificationSoundPreferences>({ calls: false, messages: false });
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activityRefresh, setActivityRefresh] = useState(0);

  useEffect(() => {
    let mounted = true;
    setNotice("");
    setError("");

    if (section === "location") {
      setLoading(true);
      void apiRequest<LocationSettings>("/api/v1/attendance/config")
        .then((value) => {
          if (!mounted) return;
          if (value.configured && value.latitude !== null && value.longitude !== null) {
            setCoordinates(`${value.latitude}, ${value.longitude}`);
          } else {
            setCoordinates("");
          }
          setRadius(String(value.radiusMeters));
          setLocationTimezone(value.timezone);
        })
        .catch((reason: unknown) => {
          if (mounted) setError(reason instanceof Error ? reason.message : "We couldn't load the business location.");
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    } else if (section === "sounds") {
      setSoundSettings(getNotificationSoundPreferences(userId));
      setLoading(false);
    } else if (section === "system" || section === "notifications") {
      if (!canManage) return () => { mounted = false; };
      setLoading(true);
      void adminRequest<BusinessSettings>("/settings")
        .then((value) => {
          if (mounted) setSettings(value);
        })
        .catch((reason: unknown) => {
          if (mounted) setError(reason instanceof Error ? reason.message : "We couldn't load business settings.");
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    } else if (section === "activity") {
      if (!canManage) return () => { mounted = false; };
      setLoading(true);
      void adminRequest<{ activities: ActivityEntry[] }>("/activity")
        .then((value) => {
          if (mounted) setActivities(value.activities);
        })
        .catch((reason: unknown) => {
          if (mounted) setError(reason instanceof Error ? reason.message : "We couldn't load administrator activity.");
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    }

    return () => { mounted = false; };
  }, [section, canManage, activityRefresh, userId]);

  function detectLocation() {
    setNotice("");
    setError("");
    if (!navigator.geolocation) {
      setError("Location is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setCoordinates(`${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`),
      () => setError("Location access was denied or could not be detected."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function saveLocation() {
    setError("");
    setNotice("");
    const [latitude, longitude] = coordinates.split(",").map((value) => Number(value.trim()));
    const radiusMeters = Number(radius);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setError("Enter a valid latitude and longitude.");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<{ message: string }>("/api/v1/attendance/config", {
        method: "PUT",
        body: JSON.stringify({ latitude, longitude, radiusMeters, timezone: locationTimezone }),
      });
      setNotice(result.message);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't save the business location.");
    } finally {
      setSaving(false);
    }
  }

  async function saveBusinessSettings() {
    if (!settings) return;
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const result = await adminRequest<{ message: string }>("/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setNotice(result.message);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't save business settings.");
    } finally {
      setSaving(false);
    }
  }

  function updateNotification(key: keyof NotificationSettings, checked: boolean) {
    setSettings((current) => current
      ? { ...current, notifications: { ...current.notifications, [key]: checked } }
      : current);
  }

  function updateSound(key: keyof NotificationSoundPreferences, checked: boolean) {
    setSoundSettings((current) => ({ ...current, [key]: checked }));
  }

  function saveSoundSettings() {
    setError("");
    setNotice("");
    try {
      saveNotificationSoundPreferences(userId, soundSettings);
      setNotice("Notification sound settings saved on this device.");
    } catch (reason: unknown) {
      console.error("Could not save notification sound settings.", reason);
      setError("We couldn't save notification sound settings in this browser.");
    }
  }

  async function testSound(sound: NotificationSound) {
    setError("");
    setNotice("");
    try {
      await playNotificationTone(sound);
    } catch (reason: unknown) {
      console.error("Could not play the notification sound preview.", reason);
      setError(reason instanceof Error ? reason.message : "We couldn't play the notification sound.");
    }
  }

  return (
    <section className="module-page">
      <PageHeading
        title={section === "menu" ? "Settings" : settingTitle(section)}
        description={section === "menu"
          ? "Manage your notification sounds and business configuration."
          : section === "sounds"
            ? "Choose which incoming alerts make a sound on this device."
            : "Manage Flex Bar's system-wide configuration."}
      />
      {section !== "menu" && <button className="icon-link" onClick={() => setSection("menu")}>← Back to settings</button>}
      {!canManage && section !== "menu" && section !== "location" && section !== "sounds" && (
        <div className="alert alert--error" role="alert">These settings are available to the Flex Bar system administrator.</div>
      )}
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {notice && <div className="alert alert--success" role="status">{notice}</div>}
      {loading && <div className="surface-card"><p className="empty-state">Loading settings…</p></div>}

      {!loading && section === "menu" && (
        <div className="surface-card settings-list">
          <button className="settings-row" onClick={() => setSection("sounds")}><span className="settings-row__icon"><Volume2 size={17} /></span><span><strong>Call &amp; message sounds</strong><small>Turn incoming call and message tones on or off</small></span><ChevronRight size={16} /></button>
          {canManage && <>
            <button className="settings-row" onClick={() => setSection("location")}><span className="settings-row__icon"><MapPin size={17} /></span><span><strong>Business Location / Geofence</strong><small>Set the approved attendance location</small></span><ChevronRight size={16} /></button>
            <button className="settings-row" onClick={() => setSection("roles")}><span className="settings-row__icon"><UsersRound size={17} /></span><span><strong>Roles &amp; Permissions</strong><small>Manage team access and assignments</small></span><ChevronRight size={16} /></button>
            <button className="settings-row" onClick={() => setSection("notifications")}><span className="settings-row__icon"><Bell size={17} /></span><span><strong>Notifications</strong><small>Control system-wide notification categories</small></span><ChevronRight size={16} /></button>
            <button className="settings-row" onClick={() => setSection("activity")}><span className="settings-row__icon"><Clock3 size={17} /></span><span><strong>Activity Log</strong><small>Review administrator changes</small></span><ChevronRight size={16} /></button>
            <button className="settings-row" onClick={() => setSection("system")}><span className="settings-row__icon"><SlidersHorizontal size={17} /></span><span><strong>System Settings</strong><small>Set currency, timezone and business hours</small></span><ChevronRight size={16} /></button>
          </>}
        </div>
      )}

      {!loading && section === "sounds" && (
        <div className="surface-card form-card">
          <h2>Call and message sounds</h2>
          <p className="form-help">Choose whether Flex Bar plays a tone for incoming calls and messages while the app is open. Browser notification permission controls alerts when Flex Bar is closed.</p>
          <div className="settings-list">
            <label className="toggle-row settings-sound-row">
              <span><strong>Incoming calls</strong><small>Play a ringing tone when someone calls you.</small></span>
              <input type="checkbox" checked={soundSettings.calls} onChange={(event) => updateSound("calls", event.target.checked)} />
            </label>
            <label className="toggle-row settings-sound-row">
              <span><strong>New messages</strong><small>Play a tone when a new chat message arrives.</small></span>
              <input type="checkbox" checked={soundSettings.messages} onChange={(event) => updateSound("messages", event.target.checked)} />
            </label>
          </div>
          <div className="settings-sound-actions">
            <button className="button button--outline" type="button" onClick={() => void testSound("call")}><Volume2 size={15} />Test call tone</button>
            <button className="button button--outline" type="button" onClick={() => void testSound("message")}><Volume2 size={15} />Test message tone</button>
            <button className="button button--primary" type="button" onClick={saveSoundSettings}><Check size={15} />Save sound settings</button>
          </div>
        </div>
      )}

      {!loading && section === "location" && (
        <>
          <div className="map-preview map-preview--settings"><div className="map-preview__grid" /><span className="map-preview__pin"><MapPin size={23} fill="currentColor" /></span><span className="map-preview__ring" /></div>
          <div className="surface-card form-card">
            <h2>Business Location / Geofence</h2>
            <p className="form-help">{canManage ? "Set the approved location and radius used to validate staff and management check-ins." : "Attendance is validated against the super-admin approved location."}</p>
            {canManage && <button className="button button--outline" onClick={detectLocation}><MapPin size={16} /> Use this device's location</button>}
            <label>Latitude, longitude<input value={coordinates} onChange={(event) => setCoordinates(event.target.value)} placeholder="e.g. 6.000000, 3.000000" readOnly={!canManage} /></label>
            <label>Geofence radius (metres)<input type="number" min="25" max="2000" value={radius} onChange={(event) => setRadius(event.target.value)} readOnly={!canManage} /></label>
            <label>Business timezone<input value={locationTimezone} onChange={(event) => setLocationTimezone(event.target.value)} list="business-timezones" readOnly={!canManage} /><datalist id="business-timezones"><option value="Africa/Lagos" /><option value="Africa/Accra" /><option value="Europe/London" /><option value="UTC" /></datalist></label>
            {canManage && <button className="button button--primary" onClick={() => void saveLocation()} disabled={!coordinates || saving}><Check size={15} />{saving ? "Saving…" : "Save business location"}</button>}
          </div>
        </>
      )}

      {!loading && section === "roles" && canManage && (
        <div className="surface-card">
          <div className="surface-card__heading"><h2>Access roles</h2><span className="status-pill status-pill--neutral">Server enforced</span></div>
          {["Super Admin", "Management Admin", "Department Supervisor", "Inventory Officer", "Cash & Sales Officer", "Staff"].map((role) => <div className="record-row" key={role}><span className="settings-row__icon"><ShieldCheck size={16} /></span><span className="record-row__main"><strong>{role}</strong><small>Access is verified by the backend on every protected request.</small></span></div>)}
          <p className="form-help">The primary Super Admin account has full administrator control and is protected from demotion.</p>
          {onManageUsers && <button className="button button--outline" onClick={onManageUsers}><UsersRound size={16} /> Manage users and roles</button>}
        </div>
      )}

      {!loading && section === "system" && canManage && settings && (
        <div className="surface-card form-card">
          <h2>Business preferences</h2>
          <p className="form-help">These saved settings are shared across the Flex Bar workspace.</p>
          <label>Display currency<select value={settings.currency} onChange={(event) => setSettings({ ...settings, currency: event.target.value })}><option value="NGN">Nigerian Naira (NGN)</option><option value="USD">US Dollar (USD)</option><option value="GBP">British Pound (GBP)</option><option value="EUR">Euro (EUR)</option></select></label>
          <label>Business timezone<input value={settings.timezone} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })} list="business-timezones" /><datalist id="business-timezones"><option value="Africa/Lagos" /><option value="Africa/Accra" /><option value="Europe/London" /><option value="UTC" /></datalist></label>
          <div className="settings-time-grid"><label>Opening time<input type="time" value={settings.openingTime} onChange={(event) => setSettings({ ...settings, openingTime: event.target.value })} /></label><label>Closing time<input type="time" value={settings.closingTime} onChange={(event) => setSettings({ ...settings, closingTime: event.target.value })} /></label></div>
          <button className="button button--primary" onClick={() => void saveBusinessSettings()} disabled={saving}><Check size={15} />{saving ? "Saving…" : "Save business settings"}</button>
        </div>
      )}

      {!loading && section === "notifications" && canManage && settings && (
        <div className="surface-card form-card">
          <h2>System-wide notifications</h2>
          <p className="form-help">Choose which operational event categories are enabled for the workspace.</p>
          <div className="settings-list">
            <label className="toggle-row"><span>Task assignments</span><input type="checkbox" checked={settings.notifications.taskAssignments} onChange={(event) => updateNotification("taskAssignments", event.target.checked)} /></label>
            <label className="toggle-row"><span>Low stock alerts</span><input type="checkbox" checked={settings.notifications.lowStock} onChange={(event) => updateNotification("lowStock", event.target.checked)} /></label>
            <label className="toggle-row"><span>Sales updates</span><input type="checkbox" checked={settings.notifications.salesUpdates} onChange={(event) => updateNotification("salesUpdates", event.target.checked)} /></label>
            <label className="toggle-row"><span>New messages</span><input type="checkbox" checked={settings.notifications.newMessages} onChange={(event) => updateNotification("newMessages", event.target.checked)} /></label>
          </div>
          <button className="button button--primary" onClick={() => void saveBusinessSettings()} disabled={saving}><Check size={15} />{saving ? "Saving…" : "Save notification settings"}</button>
        </div>
      )}

      {!loading && section === "activity" && canManage && (
        <div className="surface-card">
          <div className="surface-card__heading"><div><h2>Administrator activity</h2><p>Latest saved changes · newest first</p></div><button className="button button--outline" onClick={() => setActivityRefresh((value) => value + 1)}>Refresh</button></div>
          {activities.length === 0 ? <p className="empty-state">No administrator activity has been recorded yet.</p> : (
            <div className="record-list">{activities.map((entry) => <div className="record-row" key={entry.id}><span className="settings-row__icon"><Clock3 size={16} /></span><span className="record-row__main"><strong>{activityLabel(entry.action)} · {entry.targetLabel}</strong><small>{entry.actorName}{entry.actorEmail ? ` (${entry.actorEmail})` : ""} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}</small></span></div>)}</div>
          )}
        </div>
      )}
    </section>
  );
}

function settingTitle(section: SettingsSection): string {
  const titles: Record<SettingsSection, string> = {
    menu: "Settings",
    location: "Business Location / Geofence",
    roles: "Roles & Permissions",
    notifications: "Notifications",
    sounds: "Call & message sounds",
    activity: "Activity Log",
    system: "System Settings",
  };
  return titles[section];
}

function activityLabel(action: string): string {
  const labels: Record<string, string> = {
    "settings.updated": "Updated business settings",
    "attendance.location.updated": "Updated attendance location",
    "department.created": "Created department",
    "user.invited": "Invited team member",
    "user.updated": "Updated team member",
  };
  return labels[action] ?? "Administrator change";
}
