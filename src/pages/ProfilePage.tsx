import { useState } from "react";
import { Bell, ChevronRight, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import type { CurrentUser } from "../lib/api";
import { roleLabel } from "../lib/roles";
import PageHeading from "../components/PageHeading";
import PreviewNotice from "../components/PreviewNotice";
import { useToast } from "../components/ToastProvider";
import "./../css/OperationsPages.css";

export default function ProfilePage({
  user,
  onRequestPasswordReset,
}: {
  user: CurrentUser;
  onRequestPasswordReset: (email: string) => Promise<void>;
}) {
  const { showToast } = useToast();
  const [resetBusy, setResetBusy] = useState(false);
  const displayName = user.displayName ?? user.email?.split("@")[0] ?? "Flex Bar user";

  async function requestPasswordReset() {
    if (!user.email) {
      showToast("No email address is available for this account. Please contact your administrator.", "error");
      return;
    }

    setResetBusy(true);
    try {
      await onRequestPasswordReset(user.email);
      showToast("If an account exists for that email, a password reset link has been sent.", "success");
    } catch {
      showToast("We couldn't send the reset link. Please try again or contact your administrator.", "error");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <section className="module-page">
      <PageHeading title="My Profile" description="Your Flex Bar account information and security." />
      <PreviewNotice />
      <div className="surface-card profile-card">
        <span className="profile-avatar"><UserRound size={29} /></span>
        <h2>{displayName}</h2>
        <p>{roleLabel(user.role)}</p>
        <span className="status-pill"><ShieldCheck size={12} /> Active account</span>
        <div className="profile-data-grid">
          <div><small>Email address</small><strong><Mail size={14} />{user.email ?? "Not available"}</strong></div>
          <div><small>Assigned role</small><strong><LockKeyhole size={14} />{roleLabel(user.role)}</strong></div>
          <div><small>Profile ID</small><strong>{user.id.slice(0, 8)}…</strong></div>
        </div>
      </div>
      <div className="surface-card settings-list">
        <button className="settings-row"><span className="settings-row__icon"><UserRound size={17} /></span><span><strong>Account information</strong><small>Name and work email</small></span><ChevronRight size={16} /></button>
        <button className="settings-row" onClick={() => void requestPasswordReset()} disabled={resetBusy}><span className="settings-row__icon"><LockKeyhole size={17} /></span><span><strong>Change password</strong><small>{resetBusy ? "Sending reset link…" : "Send a secure password reset link"}</small></span><ChevronRight size={16} /></button>
        <button className="settings-row"><span className="settings-row__icon"><Bell size={17} /></span><span><strong>Notifications</strong><small>Manage your alerts</small></span><ChevronRight size={16} /></button>
        <button className="settings-row"><span className="settings-row__icon"><ShieldCheck size={17} /></span><span><strong>Security &amp; privacy</strong><small>Account protection</small></span><ChevronRight size={16} /></button>
      </div>
    </section>
  );
}
