import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { CurrentUser } from "../lib/api";
import { fetchCurrentUser } from "../lib/api";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useToast } from "../components/ToastProvider";
import DashboardPage from "./DashboardPage";
import RoleSelectionPage from "./RoleSelectionPage";
import SignInPage from "./SignInPage";
import SplashScreen from "../components/SplashScreen";

type AuthView = "sign-in" | "forgot-password" | "reset-password";

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
  const [splashComplete, setSplashComplete] = useState(false);
  const [returningUser, setReturningUser] = useState<boolean | undefined>();
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
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
        setSession(nextSession);
        setReturningUser(Boolean(nextSession));
        if (event === "PASSWORD_RECOVERY") {
          setAuthView("reset-password");
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
      setSession(data.session);
      setReturningUser(Boolean(data.session));
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
      setUser(null);
      setProfileLoading(false);
      return;
    }

    let mounted = true;
    setProfileLoading(true);
    setProfileError("");
    void fetchCurrentUser(session)
      .then((currentUser) => {
        if (mounted) setUser(currentUser);
      })
      .catch((reason: unknown) => {
        if (mounted) {
          setProfileError(
            reason instanceof Error && !(reason instanceof TypeError)
              ? reason.message
              : "We couldn't connect to your workspace. Check your connection or contact your administrator.",
          );
        }
      })
      .finally(() => {
        if (mounted) setProfileLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [session]);

  async function signIn(email: string, password: string) {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) showToast(authFeedback(error, "We couldn't sign you in. Please try again."), "error");
    } catch (error: unknown) {
      showToast(authFeedback(error, "We couldn't sign you in. Please try again."), "error");
    }
  }

  async function sendPasswordReset(email: string) {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
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
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        showToast(authFeedback(signOutError, "Your password was updated, but we couldn't end this session."), "error");
        return;
      }
      setAuthView("sign-in");
      showToast("Your password has been updated. Sign in with your new password.", "success");
    } catch (error: unknown) {
      showToast(authFeedback(error, "We couldn't update your password. Please try again."), "error");
    }
  }

  async function signOut() {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) showToast(authFeedback(error, "We couldn't sign you out. Please try again."), "error");
    } catch (error: unknown) {
      showToast(authFeedback(error, "We couldn't sign you out. Please try again."), "error");
    }
  }

  async function requestPasswordReset(email: string) {
    if (!supabase) throw new Error("Password reset is temporarily unavailable. Please contact your administrator.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw new Error(authFeedback(error, "We couldn't send the reset link. Please try again."));
  }

  if (!splashComplete || authLoading) return <SplashScreen returningUser={returningUser} />;

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
      <DashboardPage
        user={user}
        onSignOut={() => void signOut()}
        onRequestPasswordReset={requestPasswordReset}
      />
    );
  }

  return (
    <SignInPage
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
