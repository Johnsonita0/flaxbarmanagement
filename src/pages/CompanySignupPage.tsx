import { useState } from "react";
import type { FormEvent } from "react";
import { Building2, LockKeyhole, Mail, UserRound } from "lucide-react";
import "./../css/SignInPage.css";
import "./../css/CompanySignupPage.css";

type BusinessType = "pharmacy" | "bar" | "restaurant" | "bar_restaurant";

export default function CompanySignupPage({
  supabaseConfigured,
  onSignup,
}: {
  supabaseConfigured: boolean;
  onSignup: (details: {
    companyName: string;
    businessType: BusinessType;
    ownerName: string;
    email: string;
    password: string;
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const values = new FormData(event.currentTarget);
    try {
      await onSignup({
        companyName: String(values.get("companyName") ?? "").trim(),
        businessType: String(values.get("businessType") ?? "") as BusinessType,
        ownerName: String(values.get("ownerName") ?? "").trim(),
        email: String(values.get("email") ?? "").trim(),
        password: String(values.get("password") ?? ""),
      });
      setSubmitted(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't create your company workspace. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card company-signup-card">
        <div className="auth-card__brand">
          <span className="company-signup-mark" aria-hidden="true"><Building2 size={23} /></span>
          <p className="auth-card__tagline">STOCK · SALES · OPERATIONS</p>
        </div>
        <div className="auth-card__body">
          {submitted ? (
            <div className="auth-heading">
              <p className="eyebrow">WORKSPACE REQUESTED</p>
              <h1>Check your email</h1>
              <p>We sent a confirmation link to your email. Confirm your address to activate your company workspace and administrator account.</p>
            </div>
          ) : (
            <>
              <div className="auth-heading">
                <p className="eyebrow">NEW COMPANY</p>
                <h1>Create your workspace</h1>
                <p>Set up your company workspace for stock, sales, and daily operations.</p>
              </div>
              <form className="form-stack" onSubmit={(event) => void submit(event)}>
                <label className="field">
                  <span>Company name</span>
                  <span className="field__control"><Building2 size={17} aria-hidden="true" /><input name="companyName" required minLength={2} maxLength={120} autoComplete="organization" placeholder="Your business name" /></span>
                </label>
                <label className="field">
                  <span>Business type</span>
                  <select className="company-signup-select" name="businessType" required defaultValue="">
                    <option value="" disabled>Select your business type</option>
                    <option value="pharmacy">Chemist / Pharmacy</option>
                    <option value="bar">Bar</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="bar_restaurant">Bar &amp; Restaurant</option>
                  </select>
                </label>
                <label className="field">
                  <span>Your name</span>
                  <span className="field__control"><UserRound size={17} aria-hidden="true" /><input name="ownerName" required minLength={2} maxLength={100} autoComplete="name" placeholder="Workspace administrator" /></span>
                </label>
                <label className="field">
                  <span>Email address</span>
                  <span className="field__control"><Mail size={17} aria-hidden="true" /><input name="email" type="email" required autoComplete="email" placeholder="you@company.com" /></span>
                </label>
                <label className="field">
                  <span>Password</span>
                  <span className="field__control"><LockKeyhole size={17} aria-hidden="true" /><input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" /></span>
                </label>
                {error && <div className="alert alert--error" role="alert">{error}</div>}
                {!supabaseConfigured && <p className="setup-note">Company registration is not available yet. Please try again later.</p>}
                <button className="button button--primary" type="submit" disabled={!supabaseConfigured || busy}>
                  {busy ? "Creating workspace…" : "Create company workspace"}
                </button>
              </form>
            </>
          )}
        </div>
        <div className="auth-card__footer"><LockKeyhole size={14} /> Secure company workspace registration</div>
      </section>
    </main>
  );
}
