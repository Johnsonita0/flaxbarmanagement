import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { apiRequest } from "../lib/api";
import "../css/LockPinGate.css";

export default function LockPinGate({
  mode,
  onComplete,
  onResetRequired,
}: {
  mode: "setup" | "unlock";
  onComplete: () => void;
  onResetRequired?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!/^\d{4}$/.test(pin)) {
      setError("Enter a four-digit PIN.");
      return;
    }
    if (mode === "setup" && pin !== confirmation) {
      setError("The PINs do not match.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "setup") {
        await apiRequest("/api/v1/profile/lock-pin", {
          method: "POST",
          body: JSON.stringify({ pin }),
        });
      } else {
        await apiRequest("/api/v1/profile/lock-pin/verify", {
          method: "POST",
          body: JSON.stringify({ pin }),
        });
      }
      onComplete();
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : "We couldn't verify your lock PIN.";
      if (mode === "unlock" && message.includes("needs to be set up again")) {
        onResetRequired?.();
        return;
      }
      setError(message);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="lock-pin-page">
      <section className="lock-pin-card">
        <span className="lock-pin-card__icon">{mode === "setup" ? <KeyRound size={24} /> : <ShieldCheck size={25} />}</span>
        <p className="eyebrow">FLEX BAR · ACCOUNT SECURITY</p>
        <h1>{mode === "setup" ? "Create your lock PIN" : "Workspace locked"}</h1>
        <p className="lock-pin-card__description">
          {mode === "setup"
            ? "Create a four-digit PIN. Your workspace will lock after 20 minutes of inactivity."
            : "Enter your four-digit PIN to continue. The workspace locks after 20 minutes of inactivity."}
        </p>
        <form className="lock-pin-form" onSubmit={(event) => void submitPin(event)}>
          <label>
            {mode === "setup" ? "Four-digit PIN" : "Lock PIN"}
            <input
              autoFocus
              autoComplete="off"
              inputMode="numeric"
              pattern="[0-9]{4}"
              type="password"
              maxLength={4}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              required
            />
          </label>
          {mode === "setup" && (
            <label>
              Confirm PIN
              <input
                autoComplete="off"
                inputMode="numeric"
                pattern="[0-9]{4}"
                type="password"
                maxLength={4}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, "").slice(0, 4))}
                required
              />
            </label>
          )}
          {error && <p className="alert alert--error" role="alert">{error}</p>}
          <button className="button button--primary" type="submit" disabled={busy || pin.length !== 4 || (mode === "setup" && confirmation.length !== 4)}>
            <KeyRound size={16} />{busy ? "Please wait…" : mode === "setup" ? "Save lock PIN" : "Unlock workspace"}
          </button>
        </form>
      </section>
    </main>
  );
}
