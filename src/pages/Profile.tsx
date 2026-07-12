import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import type { CertLevel, HoursSource, Pilot, RoleType } from "../lib/types";

const CERT_OPTIONS: CertLevel[] = ["student", "ppl", "cpl", "cfi", "cfii", "mei", "atp", "ratp"];
const RATING_OPTIONS = ["instrument", "multi_engine", "high_performance", "complex", "tailwheel"];
const ROLE_OPTIONS: { value: RoleType; label: string }[] = [
  { value: "flight_instructor", label: "Flight instructor" },
  { value: "part135_charter", label: "Part 135 / Charter" },
  { value: "regional_airline", label: "Regional airline" },
  { value: "cargo", label: "Cargo" },
  { value: "corporate", label: "Corporate" },
  { value: "survey_patrol", label: "Survey & patrol" },
  { value: "banner_tow", label: "Banner & tow" },
  { value: "tour_sightseeing", label: "Tour & sightseeing" },
  { value: "other", label: "Other" },
];
const HOUR_FIELDS: { key: HourKey; label: string }[] = [
  { key: "total_hours", label: "TOTAL" },
  { key: "pic_hours", label: "PIC" },
  { key: "xc_hours", label: "XC" },
  { key: "night_hours", label: "NIGHT" },
  { key: "instrument_hours", label: "INSTR" },
  { key: "multi_hours", label: "MULTI" },
];

type HourKey = "total_hours" | "pic_hours" | "xc_hours" | "night_hours" | "instrument_hours" | "multi_hours";

const SOURCE_LABEL: Record<HoursSource, string> = {
  self_reported: "SELF-REPORTED",
  logbook_import: "LOGBOOK IMPORT",
  cert_verified: "CERT VERIFIED",
};

export default function Profile() {
  const { session, signOut } = useAuth();
  const [pilot, setPilot] = useState<Pilot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data, error } = await supabase
        .from("pilots").select("*").eq("id", session.user.id).maybeSingle();
      if (error) setError(error.message);
      // Row normally exists via the signup trigger; fall back to a blank
      // local row for accounts created before the migration.
      setPilot(
        (data as Pilot | null) ?? {
          id: session.user.id,
          full_name: (session.user.user_metadata?.full_name as string) ?? null,
          target_role: null, home_base: null,
          certificates: [], ratings: [],
          total_hours: 0, pic_hours: 0, xc_hours: 0,
          night_hours: 0, instrument_hours: 0, multi_hours: 0,
          hours_source: "self_reported", hours_updated_at: null,
          created_at: "", updated_at: "",
        },
      );
      setLoading(false);
    })();
  }, [session]);

  if (loading || !pilot) return <div className="wrap"><p className="muted">Loading profile…</p></div>;

  const set = <K extends keyof Pilot>(key: K, value: Pilot[K]) => {
    setSaved(false);
    setPilot({ ...pilot, [key]: value });
  };

  // Typing a number is a self-report: manual edits always downgrade the
  // provenance, even if the previous value came from a logbook import.
  const setHours = (key: HourKey, raw: string) => {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    setSaved(false);
    setPilot({ ...pilot, [key]: n, hours_source: "self_reported" });
  };

  const toggle = (key: "certificates" | "ratings", value: string) => {
    const list = pilot[key] as string[];
    set(key, (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]) as never);
  };

  async function save() {
    if (!pilot) return;
    setSaving(true);
    setError(null);
    const { created_at, updated_at, hours_updated_at, ...row } = pilot;
    const { error } = await supabase.from("pilots").upsert({
      ...row,
      hours_updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return setError(error.message);
    setSaved(true);
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <h1>Your pilot profile</h1>
          <p className="muted">
            These numbers drive your matches on the <Link to="/jobs">job board</Link> — eligibility
            is computed in SQL from exactly what's saved here.
          </p>
        </div>
        <button className="linklike" onClick={signOut}>Sign out</button>
      </div>

      <div className="panel form">
        <div className="form-row">
          <label className="field">
            <span>Full name</span>
            <input value={pilot.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} />
          </label>
          <label className="field">
            <span>Target role</span>
            <select value={pilot.target_role ?? ""}
                    onChange={(e) => set("target_role", (e.target.value || null) as RoleType | null)}>
              <option value="">— pick one —</option>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Home base</span>
            <input value={pilot.home_base ?? ""} onChange={(e) => set("home_base", e.target.value)}
                   placeholder="DFW" maxLength={48} />
          </label>
        </div>
      </div>

      <div className="panel form">
        <h3 className="panel-title">
          Your hours <span className="src-badge">{SOURCE_LABEL[pilot.hours_source]}</span>
        </h3>
        <div className="hobbs">
          {HOUR_FIELDS.map(({ key, label }) => (
            <label key={key} className="hobbs-cell">
              <span>{label}</span>
              <input type="number" min={0} step={1} value={pilot[key]}
                     onChange={(e) => setHours(key, e.target.value)} />
            </label>
          ))}
        </div>
        <p className="muted small">
          Self-reported for now — the logbook import will replace these with verified totals.
        </p>
      </div>

      <div className="panel form">
        <h3 className="panel-title">Certificates held</h3>
        <div className="certs">
          {CERT_OPTIONS.map((c) => (
            <button key={c} type="button"
                    className={`chip ${pilot.certificates.includes(c) ? "on" : ""}`}
                    onClick={() => toggle("certificates", c)}>
              {c.toUpperCase()}
            </button>
          ))}
        </div>
        <h3 className="panel-title">Ratings & endorsements</h3>
        <div className="certs">
          {RATING_OPTIONS.map((r) => (
            <button key={r} type="button"
                    className={`chip ${pilot.ratings.includes(r) ? "on" : ""}`}
                    onClick={() => toggle("ratings", r)}>
              {r.replace("_", " ").toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="err">Error: {error}</p>}
      <div className="save-row">
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        {saved && <span className="notice">Saved ✓ — <Link to="/jobs">see your matches</Link></span>}
      </div>
    </div>
  );
}
