import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { CircleHelp, KeyRound, LockKeyhole, LogOut } from "lucide-react";
import { apiRequest } from "../lib/api";
import { getProfilePhotoUrl, type CurrentUser } from "../lib/api";
import { roleLabel } from "../lib/roles";
import "../css/LockPinGate.css";

function PinBoxes({
  label,
  value,
  onChange,
  autoFocus = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  function handleChange(index: number, rawValue: string) {
    const digits = rawValue.replace(/\D/g, "");
    if (!digits) {
      onChange(value.slice(0, index));
      return;
    }
    const next = value.split("");
    for (const [offset, digit] of [...digits].entries()) {
      if (index + offset < 4) next[index + offset] = digit;
    }
    onChange(next.join("").slice(0, 4));
    inputs.current[Math.min(index + digits.length, 3)]?.focus();
  }

  function handleKeyDown(index: number, key: string) {
    if (key === "Backspace" && !value[index] && index > 0) {
      onChange(value.slice(0, index - 1));
      inputs.current[index - 1]?.focus();
    } else if (key === "ArrowLeft" && index > 0) {
      inputs.current[index - 1]?.focus();
    } else if (key === "ArrowRight" && index < 3) {
      inputs.current[index + 1]?.focus();
    }
  }

  return (
    <div className="lock-pin-box-group" role="group" aria-label={label}>
      {Array.from({ length: 4 }, (_, index) => (
        <input
          key={index}
          ref={(element) => { inputs.current[index] = element; }}
          className="lock-pin-digit"
          type="password"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`${label}, digit ${index + 1} of 4`}
          autoFocus={autoFocus && index === 0}
          value={value[index] ?? ""}
          disabled={disabled}
          maxLength={4}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event.key)}
          onPaste={(event) => {
            event.preventDefault();
            handleChange(index, event.clipboardData.getData("text"));
          }}
          required={index === 0}
        />
      ))}
    </div>
  );
}

export default function LockPinGate({
  mode,
  user,
  onComplete,
  onResetRequired,
  onSignOut,
}: {
  mode: "setup" | "unlock";
  user: CurrentUser;
  onComplete: () => void;
  onResetRequired?: () => void;
  onSignOut: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [helpMessage, setHelpMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const profilePhoto = getProfilePhotoUrl(user.avatarPath);
  const name = user.displayName?.trim() || user.email || "Team member";
  const displayRole = user.role === "super_admin"
    ? "System Administrator"
    : user.role === "management_admin"
      ? "Management Admin"
      : roleLabel(user.role);

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
      setConfirmation("");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (mode === "unlock" && pin.length === 4 && !busy) {
      formRef.current?.requestSubmit();
    }
  }, [busy, mode, pin]);

  return (
    <main className="lock-pin-page">
      <div className="lock-pin-workspace">{user.companyName}</div>
      <section className={`lock-pin-card${mode === "unlock" && busy ? " lock-pin-card--loading" : ""}`}>
        {mode === "unlock" && busy ? (
          <div className="lock-pin-loading" role="status" aria-live="polite">
            <LockKeyhole className="lock-pin-loading__icon" size={38} strokeWidth={1.8} />
            <p>Unlocking your account dashboard</p>
            <span>Please wait . . .</span>
            <span className="lock-pin-loading__spinner" aria-hidden="true" />
          </div>
        ) : <>
          <div className="lock-pin-profile">
            <div className="lock-pin-profile__avatar">
              {profilePhoto
                ? <img src={profilePhoto} alt="" />
                : <span>{name.slice(0, 1).toUpperCase()}</span>}
              <span className="lock-pin-profile__badge"><LockKeyhole size={12} /></span>
            </div>
            <h1>{mode === "setup" ? "Create your lock PIN" : name}</h1>
            <span className="lock-pin-profile__role">{displayRole}</span>
            <p>{mode === "setup" ? "Create a PIN to secure your workspace." : <>Welcome back. <strong>Enter your PIN</strong> to continue.</>}</p>
          </div>
          <form ref={formRef} className="lock-pin-form" onSubmit={(event) => void submitPin(event)}>
            {mode === "setup" && <span className="lock-pin-form__label">Create a four-digit PIN</span>}
            <PinBoxes label={mode === "setup" ? "Four-digit PIN" : "Lock PIN"} value={pin} onChange={setPin} autoFocus disabled={busy} />
            {mode === "setup" && <>
              <span className="lock-pin-form__label">Confirm your PIN</span>
              <PinBoxes label="Confirm PIN" value={confirmation} onChange={setConfirmation} disabled={busy} />
            </>}
            {error && <p className="alert alert--error" role="alert">{error}</p>}
            {mode === "setup" && <button className="button button--primary" type="submit" disabled={busy || pin.length !== 4 || confirmation.length !== 4}>
              <KeyRound size={16} />Save lock PIN
            </button>}
          </form>
        </>}
      </section>
      {mode === "unlock" && <nav className="lock-pin-actions" aria-label="PIN options">
        <button type="button" onClick={() => setHelpMessage("Ask your administrator to reset your PIN, then sign in again.")}>
          <CircleHelp size={13} /> Forgot PIN
        </button>
        <span aria-hidden="true" />
        <button type="button" onClick={onSignOut}><LogOut size={13} /> Log out instead</button>
      </nav>}
      {helpMessage && <p className="lock-pin-help" role="status">{helpMessage}</p>}
    </main>
  );
}
