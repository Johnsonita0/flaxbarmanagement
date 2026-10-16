import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { CurrentUser } from "../lib/api";
import { fetchCurrentUser } from "../lib/api";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import DashboardPage from "./DashboardPage";
import RoleSelectionPage from "./RoleSelectionPage";
import SignInPage from "./SignInPage";
import SplashScreen from "../components/SplashScreen";

type AuthView = "sign-in" | "forgot-password" | "reset-password";

export default function AppRouter() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authView, setAuthView] = useState<AuthView>("sign-in");
  const [splashComplete, setSplashComplete] = useState(false);
  const [returningUser, setReturningUser] = useState<boolean | undefined>();
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [notice, setNotice] = useState("");
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
          setAuthError("");
          setNotice("");
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
      if (error) setAuthError(error.message);
      setSession(data.session);
      setReturningUser(Boolean(data.session));
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

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
            reason instanceof Error
              ? reason.message
              : "Could not load your account. Please try again.",
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
    setAuthError("");
    setNotice("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  }

  async function sendPasswordReset(email: string) {
    if (!supabase) return;
    setAuthError("");
    setNotice("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    setNotice("If an account exists for that email, a password reset link is on its way.");
  }

  async function updatePassword(password: string, confirmation: string) {
    if (!supabase) return;
    setAuthError("");
    setNotice("");
    if (password.length < 8) {
      setAuthError("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setAuthError("The passwords do not match.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setAuthError(error.message);
      return;
    }
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setAuthError(signOutError.message);
      return;
    }
    setAuthView("sign-in");
    setNotice("Your password has been updated. Sign in with your new password.");
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setProfileError(error.message);
  }

  async function requestPasswordReset(email: string) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
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
          <p className="muted-copy">Your sign-in succeeded, but your Flex Bar profile could not be loaded.</p>
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
      error={authError}
      notice={notice}
      supabaseConfigured={isSupabaseConfigured}
      onSignIn={signIn}
      onSendPasswordReset={sendPasswordReset}
      onUpdatePassword={updatePassword}
      onViewChange={(view) => {
        setAuthError("");
        setNotice("");
        setAuthView(view);
      }}
    />
  );
}
