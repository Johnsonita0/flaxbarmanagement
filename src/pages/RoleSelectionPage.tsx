import { ArrowRight, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import type { CurrentUser } from "../lib/api";
import { roleLabel } from "../lib/roles";
import Brand from "../components/Brand";
import "../css/RoleSelectionPage.css";

export default function RoleSelectionPage({
  user,
  onContinue,
  onSignOut,
}: {
  user: CurrentUser;
  onContinue: () => void;
  onSignOut: () => void;
}) {
  return (
    <main className="role-page">
      <section className="role-card">
        <div className="role-card__header"><Brand compact /></div>
        <div className="role-card__body">
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>Continue to Flex Bar</h1>
          <p className="role-card__intro">Your access is set by your Flex Bar administrator.</p>
          <div className="assigned-role">
            <span className="assigned-role__icon"><UserRound size={19} /></span>
            <span className="assigned-role__details">
              <strong>{roleLabel(user.role)}</strong>
              <small>{user.displayName ?? user.email}</small>
            </span>
            <ShieldCheck size={18} className="assigned-role__check" />
          </div>
          <p className="role-card__secure"><LockKeyhole size={14} /> Your role and permissions cannot be changed here.</p>
          <button className="button button--primary role-card__continue" onClick={onContinue}>
            Continue <ArrowRight size={17} />
          </button>
          <button className="text-button role-card__signout" onClick={onSignOut}>Sign out</button>
        </div>
      </section>
    </main>
  );
}
