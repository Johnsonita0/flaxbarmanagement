import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { CurrentUser } from "../lib/api";
import { apiRequest, claimDeviceSession, fetchCurrentUser, releaseDeviceSession } from "../lib/api";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useToast } from "../components/ToastProvider";
import DashboardPage from "./DashboardPage";
import RoleSelectionPage from "./RoleSelectionPage";
import SignInPage from "./SignInPage";
import SplashScreen from "../components/SplashScreen";
import LockPinGate from "./LockPinGate";
import CompanySignupPage from "./CompanySignupPage";
import { InAppCallsProvider } from "../components/InAppCalls";

type AuthView = "sign-in" | "forgot-password" | "reset-password";

function passwordRecoveryRedirectUrl() {
  const redirect = new URL("/", window.location.origin);
  redirect.searchParams.set("password_reset", "1");
  return redirect.toString();
}

function authFeedback(error: unknown, fallback: string) {
  let code = "";
  let message = error instanceof Error ? error.message.toLowerCase() : "";
  let status: number | undefined;

  if (typeof error === "object" && error !== null) {
    if ("code" in error && typeof error.code === "string") code = error.code.toLowerCase();
    if ("message" in error && typeof error.message === "string") message = error.message.toLowerCase();
    if ("status" in error && typeof error.status === "number") status = error.status;
  }

  if (status === 429 || code === "too_many_requests") {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "The email address or password you entered is incorrect.";
  }
  if (code === "email_not_confirmed") {
    return "Please verify your email address before signing in.";
  }
  if (error instanceof TypeError || message.includes("fetch")) {
    return "We couldn't connect right now. Check your connection and try again.";
  }
  return fallback;
}

export default function AppRouter() {
  const { showToast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authView, setAuthView] = useState<AuthView>("sign-in");
  const [passwordSetupRequired, setPasswordSetupRequired] = useState(false);
  const [workspaceLocked, setWorkspaceLocked] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);
  const [returningUser, setReturningUser] = useState<boolean | undefined>();
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [deviceSessionReady, setDeviceSessionReady] = useState(false);
  const [deviceSessionError, setDeviceSessionError] = useState("");
  const [deviceSessionRetry, setDeviceSessionRetry] = useState(0);
  const [roleConfirmed, setRoleConfirmed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSplashComplete(true), 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setReturningUser(false);
      setAuthLoading(false);
      return;
    }

    let mounted = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, nextSession: Session | null) => {
        if (!mounted) return;
        setSession((currentSession) =>
          currentSession?.user.id === nextSession?.user.id ? currentSession : nextSession,
        );
        setReturningUser(Boolean(nextSession));
        if (event === "PASSWORD_RECOVERY") {
          setAuthView("reset-password");
          setPasswordSetupRequired(true);
        }
        if (event === "SIGNED_OUT") {
          window.history.replaceState(null, "", "/");
        }
        if (!nextSession) {
          setUser(null);
          setRoleConfirmed(false);
          setProfileError("");
        }
      },
    );

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) showToast(authFeedback(error, "We couldn't check your sign-in. Please try again."), "error");
      setSession((currentSession) =>
        currentSession?.user.id === data.session?.user.id ? currentSession : data.session,
      );
      setReturningUser(Boolean(data.session));
      if (new URLSearchParams(window.location.search).get("invite") === "1" && data.session) {
        setPasswordSetupRequired(true);
        setAuthView("reset-password");
      }
      if (new URLSearchParams(window.location.search).has("invite")) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
      }
      setAuthLoading(false);
    }).catch(() => {
      if (!mounted) return;
      showToast("We couldn't connect right now. Check your connection and try again.", "error");
      setReturningUser(false);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [showToast]);

  useEffect(() => {
    if (!session) {
      setDeviceSessionReady(true);
      setDeviceSessionError("");
      return;
    }

    let mounted = true;
    setDeviceSessionReady(false);
    setDeviceSessionError("");
    void claimDeviceSession(session).then((claimed) => {
      if (!mounted) return;
      if (claimed) {
        setDeviceSessionReady(true);
        return;
      }
      showToast("This account is already signed in on another device. Sign out there before trying again.", "error");
      void supabase?.auth.signOut({ scope: "local" }).then(({ error }) => {
        if (!error || !mounted) return;
        console.error("Could not clear the blocked device's local sign-in.", error);
        setDeviceSessionError("This account is already active on another device. Sign out there, or try again after its inactive session expires.");
        setDeviceSessionReady(true);
      }).catch((error: unknown) => {
        console.error("Could not clear the blocked device's local sign-in.", error);
        if (mounted) {
          setDeviceSessionError("This account is already active on another device. Sign out there, or try again after its inactive session expires.");
          setDeviceSessionReady(true);
        }
      });
    }).catch((error: unknown) => {
      console.error("Could not verify the active account device.", error);
      if (mounted) {
        setDeviceSessionError(error instanceof Error ? error.message : "We couldn't verify this device.");
        setDeviceSessionReady(true);
      }
    });
    return () => { mounted = false; };
  }, [session, deviceSessionRetry, showToast]);

  useEffect(() => {
    if (!session || !deviceSessionReady || deviceSessionError) {
      if (!session) {
        setUser(null);
        setProfileLoading(false);
      }
      return;
    }

    let mounted = true;
    const hasVerifiedUser = user?.id === session.user.id;
    if (!hasVerifiedUser) setProfileLoading(true);
    setProfileError("");
    void fetchCurrentUser(session)
      .then((currentUser) => {
        if (mounted) setUser(currentUser);
      })
      .catch((reason: unknown) => {
        if (mounted) {
          const message = reason instanceof Error && !(reason instanceof TypeError)
            ? reason.message
            : "We couldn't connect to your workspace. Check your connection or contact your administrator.";
          if (hasVerifiedUser) {
            console.error("Background account refresh failed; keeping the current workspace available.", reason);
          } else {
            setProfileError(message);
          }
        }
      })
      .finally(() => {
        if (mounted && !hasVerifiedUser) setProfileLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [session, deviceSessionReady, deviceSessionError]);

  useEffect(() => {
    if (!session || !deviceSessionReady || deviceSessionError) return;
    let reportedFailure = false;
    const heartbeat = () => {
      void apiRequest("/api/v1/session/heartbeat")
        .then(() => { reportedFailure = false; })
        .catch((error: unknown) => {
          if (!reportedFailure) console.error("Could not refresh the active account device session.", error);
          reportedFailure = true;
        });
    };
    const interval = window.setInterval(heartbeat, 60_000);
    return () => window.clearInterval(interval);
  }, [session, deviceSessionReady, deviceSessionError]);

  useEffect(() => {
    const handleSessionReplaced = () => {
      showToast("Another device signed in to this account. This device has been signed out.", "error");
      void supabase?.auth.signOut({ scope: "local" }).then(({ error }) => {
        if (error) console.error("Could not clear the replaced device's local sign-in.", error);
      }).catch((error: unknown) => console.error("Could not clear the replaced device's local sign-in.", error));
    };
    window.addEventListener("flexbar:account-session-replaced", handleSessionReplaced);
    return () => window.removeEventListener("flexbar:account-session-replaced", handleSessionReplaced);
  }, [showToast]);

  useEffect(() => {
    if (!session || !user || user.role === "super_admin" || !user.hasLockPin || workspaceLocked) return;
    let timer = 0;
    const scheduleLock = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setWorkspaceLocked(true), 20 * 60 * 1000);
    };
    const activityEvents = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    scheduleLock();
    activityEvents.forEach((event) => window.addEventListener(event, scheduleLock, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      activityEvents.forEach((event) => window.removeEventListener(event, scheduleLock));
    };
  }, [session, user, workspaceLocked]);

  async function signIn(email: string, password: string) {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) showToast(authFeedback(error, "We couldn't sign you in. Please try again."), "error");
    } catch (error: unknown) {
      showToast(authFeedback(error, "We couldn't sign you in. Please try again."), "error");
    }
  }

  async function signupCompany(details: {
    companyName: string;
    businessType: "pharmacy" | "bar" | "restaurant" | "bar_restaurant";
    ownerName: string;
    email: string;
    password: string;
  }) {
    if (!supabase) throw new Error("Company registration is temporarily unavailable.");
    const { error } = await supabase.auth.signUp({
      email: details.email,
      password: details.password,
      options: {
        emailRedirectTo: new URL("/", window.location.origin).toString(),
        data: {
          company_name: details.companyName,
          business_type: details.businessType,
          display_name: details.ownerName,
        },
      },
    });
    if (error) throw new Error(authFeedback(error, "We couldn't create your company workspace. Please try again."));
  }

  async function sendPasswordReset(email: string) {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: passwordRecoveryRedirectUrl(),
      });
      if (error) {
        showToast(authFeedback(error, "We couldn't send the reset link. Please try again."), "error");
        return;
      }
      showToast("If an account exists for that email, a password reset link is on its way.", "success");
    } catch (error: unknown) {
      showToast(authFeedback(error, "We couldn't send the reset link. Please try again."), "error");
    }
  }

  async function updatePassword(password: string, confirmation: string) {
    if (!supabase) return;
    if (password.length < 8) {
      showToast("Choose a password with at least 8 characters.", "error");
      return;
    }
    if (password !== confirmation) {
      showToast("The passwords don't match. Please check and try again.", "error");
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        showToast(authFeedback(error, "We couldn't update your password. Please try again."), "error");
        return;
      }
      void apiRequest("/api/v1/calls/signout", { method: "POST" }).catch((callError: unknown) => {
        console.error("Could not end in-app call sessions before password-reset sign-out.", callError);
      });
      const { signOutError, releaseError } = await signOutCurrentDevice();
      if (signOutError) {
        showToast(authFeedback(signOutError, "Your password was updated, but we couldn't end this session."), "error");
        return;
      }
      if (releaseError) {
        console.error("The password was updated, but the active device session could not be released.", releaseError);
      }
      setAuthView("sign-in");
      setPasswordSetupRequired(false);
      showToast(
        releaseError
          ? "Your password was updated and this device signed out. Another device may need to wait up to 15 minutes before signing in."
          : "Your password has been updated. Sign in with your new password.",
        releaseError ? "error" : "success",
      );
    } catch (error: unknown) {
      showToast(authFeedback(error, "We couldn't update your password. Please try again."), "error");
    }
  }

  async function signOut() {
    if (!supabase) return;
    try {
      void apiRequest("/api/v1/calls/signout", { method: "POST" }).catch((callError: unknown) => {
        console.error("Could not end in-app call sessions before sign-out.", callError);
      });
      const { signOutError, releaseError } = await signOutCurrentDevice();
      if (signOutError) {
        showToast(authFeedback(signOutError, "We couldn't sign you out. Please try again."), "error");
        return;
      }
      if (releaseError) {
        console.error("The active device session could not be released during sign-out.", releaseError);
        showToast("You were signed out, but another device may need to wait up to 15 minutes before signing in.", "error");
      }
    } catch (error: unknown) {
      showToast(authFeedback(error, "We couldn't sign you out. Please try again."), "error");
    }
  }

  async function signOutCurrentDevice() {
    if (!supabase) return { signOutError: null, releaseError: null };
    let releaseError: unknown = null;
    const { data: { session: activeSession }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      releaseError = sessionError;
    } else if (activeSession) {
      try {
        await releaseDeviceSession(activeSession);
      } catch (error: unknown) {
        releaseError = error;
      }
    }
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    return { signOutError, releaseError };
  }

  async function requestPasswordReset(email: string) {
    if (!supabase) throw new Error("Password reset is temporarily unavailable. Please contact your administrator.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: passwordRecoveryRedirectUrl(),
    });
    if (error) throw new Error(authFeedback(error, "We couldn't send the reset link. Please try again."));
  }

  if (!splashComplete || authLoading) return <SplashScreen returningUser={returningUser} />;

  if (session && !deviceSessionReady) {
    return (
      <main className="loading-screen" aria-live="polite">
        <span className="spinner" aria-label="Loading" />
        <p>Verifying this device…</p>
      </main>
    );
  }

  if (session && deviceSessionError) {
    return (
      <main className="auth-page">
        <section className="auth-card auth-card--message">
          <h1>Device verification unavailable</h1>
          <div className="alert alert--error" role="alert">{deviceSessionError}</div>
          <p className="muted-copy">We must verify this device before opening your company workspace.</p>
          <button className="button button--primary" onClick={() => setDeviceSessionRetry((attempt) => attempt + 1)}>Try again</button>
          <button className="button button--outline" onClick={() => void signOut()}>Sign out</button>
        </section>
      </main>
    );
  }

  if (session && profileLoading) {
    return (
      <main className="loading-screen" aria-live="polite">
        <span className="spinner" aria-label="Loading" />
        <p>Loading your Flex Bar workspace…</p>
      </main>
    );
  }

  if (session && profileError) {
    return (
      <main className="auth-page">
        <section className="auth-card auth-card--message">
          <h1>Workspace unavailable</h1>
          <div className="alert alert--error" role="alert">{profileError}</div>
          <p className="muted-copy">Your account could not be verified. Contact an administrator if the issue continues.</p>
          <button className="button button--primary" onClick={() => void signOut()}>Sign out</button>
        </section>
      </main>
    );
  }

  if (session && user && passwordSetupRequired) {
    return (
      <SignInPage
        view="reset-password"
        supabaseConfigured={isSupabaseConfigured}
        onSignIn={signIn}
        onSendPasswordReset={sendPasswordReset}
        onUpdatePassword={updatePassword}
        onViewChange={setAuthView}
      />
    );
  }

  if (session && user && user.role !== "super_admin" && !user.hasLockPin) {
    return (
      <LockPinGate
        mode="setup"
        onComplete={() => setUser({ ...user, hasLockPin: true })}
      />
    );
  }

  if (session && user && workspaceLocked) {
    return (
      <LockPinGate
        mode="unlock"
        onComplete={() => setWorkspaceLocked(false)}
        onResetRequired={() => {
          setWorkspaceLocked(false);
          setUser({ ...user, hasLockPin: false });
        }}
      />
    );
  }

  if (session && user && !roleConfirmed) {
    return (
      <RoleSelectionPage
        user={user}
        onContinue={() => setRoleConfirmed(true)}
        onSignOut={() => void signOut()}
      />
    );
  }

  if (session && user) {
    return (
      <InAppCallsProvider user={user}>
        <DashboardPage
          user={user}
          onUserUpdated={setUser}
          onSignOut={() => void signOut()}
          onRequestPasswordReset={requestPasswordReset}
        />
      </InAppCallsProvider>
    );
  }

  return (
    window.location.pathname === "/signup" ? (
      <CompanySignupPage
        supabaseConfigured={isSupabaseConfigured}
        onSignup={signupCompany}
      />
    ) : <SignInPage
      view={authView}
      supabaseConfigured={isSupabaseConfigured}
      onSignIn={signIn}
      onSendPasswordReset={sendPasswordReset}
      onUpdatePassword={updatePassword}
      onViewChange={(view) => {
        setAuthView(view);
      }}
    />
  );
}
