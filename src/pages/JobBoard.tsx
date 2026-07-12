import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import type { CertLevel, Pilot, QualifyingJob } from "../lib/types";

const ALL_CERTS: CertLevel[] = ["cpl", "cfi", "cfii", "mei", "atp", "ratp"];

export default function JobBoard() {
  const { session, loading: authLoading } = useAuth();
  const [hours, setHours] = useState(268);
  const [certs, setCerts] = useState<CertLevel[]>(["cpl", "cfi"]);
  const [pilot, setPilot] = useState<Pilot | null>(null);
  const [jobs, setJobs] = useState<QualifyingJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed in: match against the SAVED profile via qualifying_jobs_for_pilot()
  // — the server reads the pilot row itself, so client state can't inflate
  // hours. Anonymous: the what-if sliders call qualifying_jobs() directly.
  // Either way, eligibility is decided in Postgres.
  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = session
      ? await supabase.rpc("qualifying_jobs_for_pilot")
      : await supabase.rpc("qualifying_jobs", { p_total_hours: hours, p_certs: certs });
    if (error) setError(error.message);
    setJobs((data as QualifyingJob[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      if (session) {
        const { data } = await supabase
          .from("pilots").select("*").eq("id", session.user.id).maybeSingle();
        setPilot(data as Pilot | null);
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session?.user.id]);

  const toggleCert = (c: CertLevel) =>
    setCerts((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const qualified = jobs.filter((j) => j.qualifies).length;

  return (
    <div className="wrap">
      <h1>Pilot openings</h1>
      <p className="muted">
        Matching is deterministic (SQL <code>qualifying_jobs</code>) — the model never decides eligibility.
      </p>

      {session ? (
        <div className="profile-banner">
          <div>
            <b>Matching against your saved profile.</b>{" "}
            <span className="pb-hrs">
              {pilot
                ? `${pilot.total_hours} HR TOTAL · ${pilot.certificates.map((c) => c.toUpperCase()).join(" ") || "NO CERTS"}`
                : "…"}
            </span>
          </div>
          <Link className="btn btn-ghost" to="/profile">Edit profile</Link>
        </div>
      ) : (
        <div className="controls">
          <label>
            Total hours: <b>{hours}</b>
            <input type="range" min={0} max={1500} step={10} value={hours}
                   onChange={(e) => setHours(Number(e.target.value))} onMouseUp={load} onTouchEnd={load} />
          </label>
          <div className="certs">
            {ALL_CERTS.map((c) => (
              <button key={c} className={`chip ${certs.includes(c) ? "on" : ""}`} onClick={() => { toggleCert(c); }}>
                {c.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="btn" onClick={load}>Update</button>
          <span className="muted small"><Link to="/signin">Sign in</Link> to match your saved profile.</span>
        </div>
      )}

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="err">Error: {error}. Did you run migrations + seed jobs?</p>}
      {!loading && !error && (
        <p className="muted">{qualified} of {jobs.length} openings — you qualify</p>
      )}

      <div className="cards">
        {jobs.map((j) => (
          <div key={j.id} className={`card ${j.qualifies ? "ok" : ""}`}>
            <div className={`qbar ${j.qualifies ? "q-ok" : j.cert_ok ? "q-hrs" : "q-cert"}`}>
              {j.qualifies ? "✓ You qualify"
                : !j.cert_ok ? `✕ Requires ${j.required_certificate.toUpperCase()}`
                : `▲ ${j.hours_short} more hours needed`}
            </div>
            <h3>{j.role_title}</h3>
            <div className="sub">{j.employer}</div>
            <div className="spec">
              <span>MIN {j.min_total_hours ?? "—"} hr</span>
              <span>{j.required_certificate.toUpperCase()}</span>
              <span>{j.location ?? "—"}</span>
            </div>
            {j.pay_raw && <div className="pay">{j.pay_raw}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
