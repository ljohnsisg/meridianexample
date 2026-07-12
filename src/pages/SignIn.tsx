import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Mode = "signin" | "signup";

export default function SignIn() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/profile";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      setBusy(false);
      if (error) return setError(error.message);
      // With email confirmation on, there's no session until they confirm.
      if (!data.session) return setNotice("Check your email to confirm your account, then sign in.");
      navigate(from, { replace: true });
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setError(error.message);
      navigate(from, { replace: true });
    }
  }

  return (
    <div className="wrap auth-wrap">
      <h1>{mode === "signin" ? "Sign in" : "Create your account"}</h1>
      <p className="muted">
        {mode === "signin"
          ? "Pick up where you left off."
          : "Your profile stores your verified hours and certificates."}
      </p>

      <form className="panel form" onSubmit={submit}>
        {mode === "signup" && (
          <label className="field">
            <span>Full name</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)}
                   autoComplete="name" placeholder="Jordan Reyes" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                 autoComplete="email" placeholder="you@example.com" />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" required minLength={8} value={password}
                 onChange={(e) => setPassword(e.target.value)}
                 autoComplete={mode === "signin" ? "current-password" : "new-password"} />
        </label>

        {error && <p className="err">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        <button className="btn" disabled={busy}>
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>

      <p className="muted">
        {mode === "signin" ? "New here? " : "Already have an account? "}
        <button className="linklike"
                onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setNotice(null); }}>
          {mode === "signin" ? "Create an account" : "Sign in instead"}
        </button>
      </p>
    </div>
  );
}
