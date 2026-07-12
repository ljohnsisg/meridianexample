export type CertLevel =
  | "none" | "student" | "ppl" | "cpl" | "cfi" | "cfii" | "mei" | "atp" | "ratp";

export type RoleType =
  | "flight_instructor" | "part135_charter" | "regional_airline" | "cargo"
  | "corporate" | "survey_patrol" | "banner_tow" | "tour_sightseeing" | "other";

export type HoursSource = "self_reported" | "logbook_import" | "cert_verified";

// Row shape of the pilots table (see 0003_pilots.sql).
// Hour/cert fields are the deterministic eligibility spine — they are
// only ever written by user input or verified imports, never by a model.
export type Pilot = {
  id: string;
  full_name: string | null;
  target_role: RoleType | null;
  home_base: string | null;
  certificates: CertLevel[];
  ratings: string[];
  total_hours: number;
  pic_hours: number;
  xc_hours: number;
  night_hours: number;
  instrument_hours: number;
  multi_hours: number;
  hours_source: HoursSource;
  hours_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

// Row shape returned by the qualifying_jobs() RPC (see 0002_matching.sql)
export type QualifyingJob = {
  id: string;
  employer: string;
  role_title: string;
  role_type: string;
  min_total_hours: number | null;
  required_certificate: CertLevel;
  location: string | null;
  pay_raw: string | null;
  qualifies: boolean;
  hours_short: number;
  cert_ok: boolean;
};
