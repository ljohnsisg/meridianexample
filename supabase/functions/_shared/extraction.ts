// _shared/extraction.ts
// One LLM step turns any raw posting (feed text, email, scraped HTML->text,
// pasted blurb) into a structured job. Tool-use guarantees valid JSON shape.
import Anthropic from "npm:@anthropic-ai/sdk@^0.30.0";

export type ExtractedJob = {
  employer: string | null;
  employer_type: string | null;
  role_title: string | null;
  role_type: string | null;              // maps to role_type enum
  min_total_hours: number | null;
  min_pic_hours: number | null;
  required_certificate: string | null;   // maps to cert_level enum
  other_requirements: string[];
  aircraft: string | null;
  location: string | null;
  location_state: string | null;
  relocation: boolean | null;
  pay_min: number | null;
  pay_max: number | null;
  pay_period: string | null;
  pay_raw: string | null;
  schedule: string | null;
  perks: string[];
  apply_url: string | null;
  posted_date: string | null;            // ISO date or null
  summary: string | null;
  extraction_confidence: number;         // 0..1, model-calibrated
  confidence_notes: string | null;
};

// Structured-output contract. Model MUST call this tool.
const EMIT_JOB_TOOL = {
  name: "emit_job",
  description: "Emit one structured aviation pilot job posting extracted from raw text.",
  input_schema: {
    type: "object",
    properties: {
      employer:             { type: ["string", "null"] },
      employer_type:        { type: ["string", "null"], description: "e.g. Regional Airline, Part 135, Flight School, Cargo, Corporate, Survey" },
      role_title:           { type: ["string", "null"] },
      role_type:            { type: ["string", "null"], enum: ["flight_instructor","part135_charter","regional_airline","cargo","corporate","survey_patrol","banner_tow","tour_sightseeing","other", null] },
      min_total_hours:      { type: ["integer", "null"], description: "Lowest TOTAL flight time required. Integer hours. null if not stated." },
      min_pic_hours:        { type: ["integer", "null"] },
      required_certificate: { type: ["string", "null"], enum: ["none","student","ppl","cpl","cfi","cfii","mei","atp","ratp", null], description: "Minimum FAA certificate the role requires." },
      other_requirements:   { type: "array", items: { type: "string" }, description: "e.g. ['multi_engine','instrument','first_class_medical']" },
      aircraft:             { type: ["string", "null"] },
      location:             { type: ["string", "null"] },
      location_state:       { type: ["string", "null"], description: "2-letter US state if determinable." },
      relocation:           { type: ["boolean", "null"] },
      pay_min:              { type: ["number", "null"] },
      pay_max:              { type: ["number", "null"] },
      pay_period:           { type: ["string", "null"], enum: ["year","month","hour","flight_hour","unknown", null] },
      pay_raw:              { type: ["string", "null"], description: "Pay exactly as written, e.g. '$48k-72k + per flight hour'." },
      schedule:             { type: ["string", "null"], enum: ["full_time","part_time","seasonal","contract","unknown", null] },
      perks:                { type: "array", items: { type: "string" }, description: "Subset of: low_time_friendly,time_building,sign_on_bonus,housing,relocation,type_training" },
      apply_url:            { type: ["string", "null"] },
      posted_date:          { type: ["string", "null"], description: "ISO date if present." },
      summary:              { type: ["string", "null"], description: "<= 300 chars, your own words." },
      extraction_confidence:{ type: "number", description: "0..1 calibrated confidence that the CRITICAL fields (employer, role_title, min_total_hours, required_certificate) are correct. Be strict." },
      confidence_notes:     { type: ["string", "null"], description: "Anything ambiguous or inferred." },
    },
    required: ["employer", "role_title", "min_total_hours", "required_certificate", "extraction_confidence"],
  },
} as const;

const SYSTEM = `You extract structured data from aviation pilot job postings for a low-time-pilot placement board.

Hard rules:
- Extract ONLY facts present in the text. Never invent hours, pay, certificates, or requirements.
- If a field is not stated, return null. Do not guess to be helpful.
- min_total_hours is the lowest TOTAL flight time the role requires, as an integer, or null.
- required_certificate is the minimum FAA certificate needed (cpl, cfi, cfii, atp, ratp, ...). "R-ATP" / "restricted ATP" -> "ratp". If the role only needs a commercial certificate, use "cpl". If none stated, use null.
- extraction_confidence must be strict and calibrated: lower it whenever the critical fields are implied rather than explicit.
- Always call the emit_job tool exactly once.`;

export async function extractJob(
  client: Anthropic,
  model: string,
  rawText: string,
): Promise<{ data: ExtractedJob; model: string }> {
  const res = await client.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0,
    system: SYSTEM,
    tools: [EMIT_JOB_TOOL as any],
    tool_choice: { type: "tool", name: "emit_job" },
    messages: [{ role: "user", content: rawText.slice(0, 12000) }],
  });

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("extraction_no_tool_use");

  const raw = block.input as Partial<ExtractedJob>;
  // fill array/scalar defaults so downstream code is null-safe
  const data: ExtractedJob = {
    employer: raw.employer ?? null,
    employer_type: raw.employer_type ?? null,
    role_title: raw.role_title ?? null,
    role_type: raw.role_type ?? null,
    min_total_hours: raw.min_total_hours ?? null,
    min_pic_hours: raw.min_pic_hours ?? null,
    required_certificate: raw.required_certificate ?? null,
    other_requirements: raw.other_requirements ?? [],
    aircraft: raw.aircraft ?? null,
    location: raw.location ?? null,
    location_state: raw.location_state ?? null,
    relocation: raw.relocation ?? null,
    pay_min: raw.pay_min ?? null,
    pay_max: raw.pay_max ?? null,
    pay_period: raw.pay_period ?? null,
    pay_raw: raw.pay_raw ?? null,
    schedule: raw.schedule ?? null,
    perks: raw.perks ?? [],
    apply_url: raw.apply_url ?? null,
    posted_date: raw.posted_date ?? null,
    summary: raw.summary ?? null,
    extraction_confidence: Number(raw.extraction_confidence ?? 0),
    confidence_notes: raw.confidence_notes ?? null,
  };
  return { data, model };
}
