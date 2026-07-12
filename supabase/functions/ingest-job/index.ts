// functions/ingest-job/index.ts
// POST one raw posting -> structured, gated job.
// Body: { source_id?, raw_text, raw_payload?, apply_url? }
// Auth: send header `x-ingest-secret: <INGEST_SECRET>` (server-to-server).
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@^0.30.0";
import { extractJob } from "../_shared/extraction.ts";
import { normalizeAndGate } from "../_shared/normalize.ts";
import { sha256, dedupeKey } from "../_shared/hash.ts";

const FAST_MODEL = "claude-haiku-4-5-20251001"; // high-volume default
const STRONG_MODEL = "claude-sonnet-5";         // escalation on low confidence

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const INGEST_SECRET = Deno.env.get("INGEST_SECRET")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (req.headers.get("x-ingest-secret") !== INGEST_SECRET) return json({ error: "unauthorized" }, 401);

  let body: { source_id?: string; raw_text?: string; raw_payload?: unknown; apply_url?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const rawText = (body.raw_text ?? "").trim();
  if (!rawText) return json({ error: "raw_text_required" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

  // ---- 1. dedupe / record intake (idempotent on content_hash) ----
  const content_hash = await sha256(dedupeKey([body.source_id, rawText.slice(0, 2000)]));

  const { data: existing } = await supabase
    .from("raw_job_intake").select("id,status").eq("content_hash", content_hash).maybeSingle();
  if (existing) return json({ status: "duplicate", intake_id: existing.id });

  const { data: intake, error: intakeErr } = await supabase
    .from("raw_job_intake")
    .insert({ source_id: body.source_id ?? null, raw_text: rawText, raw_payload: body.raw_payload ?? null, content_hash })
    .select("id").single();
  if (intakeErr) return json({ error: "intake_insert_failed", detail: intakeErr.message }, 500);

  try {
    // ---- 2. tiered extraction: Haiku first, escalate once if low confidence ----
    let { data: extracted, model } = await extractJob(anthropic, FAST_MODEL, rawText);
    let gate = normalizeAndGate(extracted);

    if (gate.reasons.includes("low_confidence")) {
      const retry = await extractJob(anthropic, STRONG_MODEL, rawText);
      extracted = retry.data; model = retry.model;
      gate = normalizeAndGate(extracted);
    }

    // ---- 3. deterministic routing ----
    const review_status = gate.needsReview ? "pending_review" : "auto_approved";
    const published = !gate.needsReview;

    const { data: job, error: jobErr } = await supabase.from("jobs").insert({
      intake_id: intake.id,
      source_id: body.source_id ?? null,
      employer: gate.fields.employer,
      employer_type: extracted.employer_type,
      role_title: gate.fields.role_title,
      role_type: gate.fields.role_type,
      min_total_hours: gate.fields.min_total_hours,
      min_pic_hours: gate.fields.min_pic_hours,
      required_certificate: gate.fields.required_certificate,
      other_requirements: extracted.other_requirements,
      aircraft: extracted.aircraft,
      location: extracted.location,
      location_state: extracted.location_state,
      relocation: extracted.relocation,
      pay_min: extracted.pay_min,
      pay_max: extracted.pay_max,
      pay_period: gate.fields.pay_period,
      pay_raw: extracted.pay_raw,
      schedule: gate.fields.schedule,
      perks: extracted.perks,
      apply_url: extracted.apply_url ?? body.apply_url ?? null,
      posted_date: extracted.posted_date,
      summary: extracted.summary,
      description: rawText,
      extraction_model: model,
      extraction_confidence: gate.confidence,
      confidence_notes: extracted.confidence_notes,
      review_status,
      published,
      content_hash,
    }).select("id").single();
    if (jobErr) throw new Error("job_insert_failed: " + jobErr.message);

    // ---- 4. queue if flagged ----
    if (gate.needsReview) {
      await supabase.from("job_review_queue").insert({
        job_id: job.id, reasons: gate.reasons, proposed: extracted,
      });
    }

    await supabase.from("raw_job_intake").update({ status: "extracted" }).eq("id", intake.id);

    return json({
      job_id: job.id, review_status, published,
      model, confidence: gate.confidence, reasons: gate.reasons,
    });
  } catch (e) {
    await supabase.from("raw_job_intake")
      .update({ status: "failed", error: String((e as Error).message ?? e) }).eq("id", intake.id);
    return json({ error: "extraction_failed", detail: String((e as Error).message ?? e) }, 500);
  }
});
