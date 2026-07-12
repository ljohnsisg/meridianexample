// _shared/normalize.ts
// Deterministic layer between the model and the database.
// This is where "does it publish or go to review" is decided — by rules,
// not by the LLM. The model's self-confidence is ONE input among several.
import type { ExtractedJob } from "./extraction.ts";

export const CONF_THRESHOLD = 0.80;

const CERT_MAP: Record<string, string> = {
  none: "none", n: "none",
  student: "student", sport: "student",
  ppl: "ppl", privatepilot: "ppl", private: "ppl",
  cpl: "cpl", commercial: "cpl", commercialpilot: "cpl",
  cfi: "cfi", flightinstructor: "cfi",
  cfii: "cfii", instrumentinstructor: "cfii",
  mei: "mei", multiengineinstructor: "mei",
  atp: "atp", airlinetransportpilot: "atp",
  ratp: "ratp", restrictedatp: "ratp", ratpr: "ratp",
};

const ROLE_TYPES = new Set([
  "flight_instructor","part135_charter","regional_airline","cargo",
  "corporate","survey_patrol","banner_tow","tour_sightseeing","other",
]);
const SCHEDULES = new Set(["full_time","part_time","seasonal","contract","unknown"]);
const PAY_PERIODS = new Set(["year","month","hour","flight_hour","unknown"]);

export type GatedJob = {
  fields: {
    employer: string;
    role_title: string;
    role_type: string;
    min_total_hours: number | null;
    min_pic_hours: number | null;
    required_certificate: string;
    schedule: string;
    pay_period: string;
  };
  confidence: number;
  reasons: string[];
  needsReview: boolean;
};

function canonCert(v: string | null): { cert: string; unmapped: boolean } {
  if (!v) return { cert: "none", unmapped: false };
  const key = v.toLowerCase().replace(/[^a-z]/g, "");
  const mapped = CERT_MAP[key];
  return mapped ? { cert: mapped, unmapped: false } : { cert: "none", unmapped: true };
}

export function normalizeAndGate(x: ExtractedJob): GatedJob {
  const reasons: string[] = [];

  // --- certificate ---
  const { cert, unmapped } = canonCert(x.required_certificate);
  if (x.required_certificate && unmapped) reasons.push("unmapped_certificate");

  // --- hours sanity (eligibility-critical) ---
  let hrs = x.min_total_hours;
  if (hrs != null && (!Number.isInteger(hrs) || hrs < 0 || hrs > 20000)) {
    reasons.push("implausible_hours");
    hrs = null;
  }
  let picHrs = x.min_pic_hours;
  if (picHrs != null && (!Number.isInteger(picHrs) || picHrs < 0 || picHrs > 20000)) picHrs = null;

  // --- critical presence ---
  if (!x.employer) reasons.push("missing_employer");
  if (!x.role_title) reasons.push("missing_role");

  // --- enum coercion (fall back + no flag; these aren't eligibility-critical) ---
  const role_type = ROLE_TYPES.has(x.role_type ?? "") ? (x.role_type as string) : "other";
  const schedule = SCHEDULES.has(x.schedule ?? "") ? (x.schedule as string) : "unknown";
  const pay_period = PAY_PERIODS.has(x.pay_period ?? "") ? (x.pay_period as string) : "unknown";

  // --- model confidence ---
  const confidence = Number.isFinite(x.extraction_confidence) ? x.extraction_confidence : 0;
  if (confidence < CONF_THRESHOLD) reasons.push("low_confidence");

  return {
    fields: {
      employer: x.employer ?? "",
      role_title: x.role_title ?? "",
      role_type,
      min_total_hours: hrs,
      min_pic_hours: picHrs,
      required_certificate: cert,
      schedule,
      pay_period,
    },
    confidence,
    reasons,
    needsReview: reasons.length > 0,
  };
}
