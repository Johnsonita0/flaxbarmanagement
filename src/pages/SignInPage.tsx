import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import Brand from "../components/Brand";
import "../css/SignInPage.css";

export type AuthView = "sign-in" | "forgot-password" | "reset-password";

export default function SignInPage({
  view,
  error,
  notice,
  supabaseConfigured,
  onSignIn,
  onSendPasswordReset,
  onUpdatePassword,
  onViewChange,
}: {
  view: AuthView;
  error: string;
  notice: string;
  supabaseConfigured: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSendPasswordReset: (email: string) => Promise<void>;
  onUpdatePassword: (password: string, confirmation: string) => Promise<void>;
  onViewChange: (view: AuthView) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: (values: FormData) => Promise<void>,
  ) {
    event.preventDefault();
    setBusy(true);
    try {
      await action(new FormData(event.currentTarget));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card__brand">
          <Brand />
          <p className="auth-card__tagline">People <span>·</span> Operations <span>·</span> Growth</p>
        </div>

        <div className="auth-card__body">
          {view === "sign-in" && (
            <>
              <div className="auth-heading">
                <p className="eyebrow">WELCOME BACK</p>
                <h1>Sign in to Flex Bar</h1>
                <p>Use your staff account to continue to your workspace.</p>
              </div>
              <form
                className="form-stack"
                onSubmit={(event) => void submit(event, async (values) => {
                  await onSignIn(
                    String(values.get("email") ?? "").trim(),
                    String(values.get("password") ?? ""),
                  );
                })}
              >
                <label className="field">
                  <span>Email address</span>
                  <span className="field__control">
                    <Mail size={17} aria-hidden="true" />
                    <input name="email" type="email" autoComplete="username" placeholder="you@flexbar.com" required />
                  </span>
                </label>
                <label className="field">
                  <span>Password</span>
                  <span className="field__control">
                    <LockKeyhole size={17} aria-hidden="true" />
                    <input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      className="icon-button field__reveal"
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((shown) => !shown)}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                </label>
                <div className="form-row form-row--right">
                  <button className="text-button" type="button" onClick={() => onViewChange("forgot-password")}>Forgot password?</button>
                </div>
                {error && <div className="alert alert--error" role="alert">{error}</div>}
                {notice && <div className="alert alert--success" role="status">{notice}</div>}
                <button className="button button--primary" type="submit" disabled={!supabaseConfigured || busy}>
                  {busy ? "Signing in…" : "Sign in"} <ArrowUpRight size={17} />
                </button>
                {!supabaseConfigured && (
                  <p className="setup-note">
                    Add the Supabase URL and publishable key to <code>frontend/.env</code> to enable sign-in.
                  </p>
                )}
              </form>
            </>
          )}

          {view === "forgot-password" && (
            <>
              <button className="back-button" type="button" onClick={() => onViewChange("sign-in")}>
                <ArrowLeft size={16} /> Back to sign in
              </button>
              <div className="auth-heading auth-heading--spaced">
                <span className="heading-icon"><Mail size={22} /></span>
                <h1>Forgot password?</h1>
                <p>Enter your work email and we’ll send you a reset link.</p>
              </div>
              <form className="form-stack" onSubmit={(event) => void submit(event, async (values) => {
                await onSendPasswordReset(String(values.get("email") ?? "").trim());
              })}>
                <label className="field">
                  <span>Email address</span>
                  <span className="field__control">
                    <Mail size={17} aria-hidden="true" />
                    <input name="email" type="email" autoComplete="email" required placeholder="you@flexbar.com" />
                  </span>
                </label>
                {error && <div className="alert alert--error" role="alert">{error}</div>}
                {notice && <div className="alert alert--success" role="status">{notice}</div>}
                <button className="button button--primary" type="submit" disabled={!supabaseConfigured || busy}>
                  {busy ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}

          {view === "reset-password" && (
            <>
              <div className="auth-heading">
                <span className="heading-icon"><ShieldCheck size={22} /></span>
                <h1>Choose a new password</h1>
                <p>Use at least 8 characters for your account password.</p>
              </div>
              <form className="form-stack" onSubmit={(event) => void submit(event, async (values) => {
                await onUpdatePassword(
                  String(values.get("password") ?? ""),
                  String(values.get("confirmPassword") ?? ""),
                );
              })}>
                <label className="field">
                  <span>New password</span>
                  <span className="field__control">
                    <LockKeyhole size={17} aria-hidden="true" />
                    <input name="password" type="password" autoComplete="new-password" required minLength={8} />
                  </span>
                </label>
                <label className="field">
                  <span>Confirm new password</span>
                  <span className="field__control">
                    <LockKeyhole size={17} aria-hidden="true" />
                    <input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} />
                  </span>
                </label>
                {error && <div className="alert alert--error" role="alert">{error}</div>}
                <button className="button button--primary" type="submit" disabled={!supabaseConfigured || busy}>
                  {busy ? "Updating…" : "Update password"}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="auth-card__footer"><LockKeyhole size={14} /> Secure access for Flex Bar team members</div>
      </section>
      <p className="auth-page__legal">© {new Date().getFullYear()} Flex Bar. Staff &amp; Business Management.</p>
    </main>
  );
}
