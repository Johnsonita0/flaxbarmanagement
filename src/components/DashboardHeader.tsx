import { Bell, ChevronDown, Menu, Search } from "lucide-react";
import { getProfilePhotoUrl } from "../lib/api";
import "../css/DashboardHeader.css";

export default function DashboardHeader({
  section,
  name,
  role,
  avatarPath,
  onToggleMenu,
  onNotifications,
  onProfile,
  unreadNotifications,
}: {
  section: string;
  name: string;
  role: string;
  avatarPath: string | null;
  onToggleMenu: () => void;
  onNotifications: () => void;
  onProfile: () => void;
  unreadNotifications: number;
}) {
  const initials = name
    .split(/[ @._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
  const avatarUrl = getProfilePhotoUrl(avatarPath);

  return (
    <header className="topbar">
      <button className="icon-button topbar__menu" aria-label="Open menu" onClick={onToggleMenu}><Menu size={21} /></button>
      <div className="breadcrumb"><span>Flex Bar</span><span>/</span><strong>{section}</strong></div>
      <div className="topbar__actions">
        <button className="icon-button topbar__search" aria-label="Search"><Search size={19} /></button>
        <button className="icon-button notification-button" aria-label={unreadNotifications ? `Notifications, ${unreadNotifications} unread` : "Notifications"} onClick={onNotifications}><Bell size={19} />{unreadNotifications > 0 && <span />}</button>
        <div className="topbar__divider" />
        <button className="account account--button" onClick={onProfile} aria-label={`Open profile for ${name}`}>
          <span className="account__avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials || "FB"}</span>
          <span className="account__details"><strong>{name}</strong><small>{role}</small></span>
          <ChevronDown size={16} className="account__chevron" />
        </button>
      </div>
    </header>
  );
}
