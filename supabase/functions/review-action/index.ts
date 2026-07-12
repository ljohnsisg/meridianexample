// functions/review-action/index.ts
// Human approves/rejects a flagged job.
// Body: { queue_id, action: "approve" | "reject", reviewer_id?, patch? }
// `patch` optionally corrects fields (e.g. fix min_total_hours) on approve.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_SECRET = Deno.env.get("INGEST_SECRET")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (req.headers.get("x-ingest-secret") !== INGEST_SECRET) return json({ error: "unauthorized" }, 401);

  const { queue_id, action, reviewer_id, patch } = await req.json().catch(() => ({}));
  if (!queue_id || !["approve", "reject"].includes(action)) return json({ error: "bad_request" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: q, error: qErr } = await supabase
    .from("job_review_queue").select("id, job_id, resolved").eq("id", queue_id).single();
  if (qErr || !q) return json({ error: "queue_item_not_found" }, 404);
  if (q.resolved) return json({ error: "already_resolved" }, 409);

  if (action === "approve") {
    const update: Record<string, unknown> = { review_status: "approved", published: true };
    if (patch && typeof patch === "object") Object.assign(update, patch); // allow field corrections
    const { error } = await supabase.from("jobs").update(update).eq("id", q.job_id);
    if (error) return json({ error: "job_update_failed", detail: error.message }, 500);
  } else {
    const { error } = await supabase.from("jobs")
      .update({ review_status: "rejected", published: false }).eq("id", q.job_id);
    if (error) return json({ error: "job_update_failed", detail: error.message }, 500);
  }

  await supabase.from("job_review_queue")
    .update({ resolved: true, resolved_by: reviewer_id ?? null, resolved_at: new Date().toISOString() })
    .eq("id", queue_id);

  return json({ ok: true, job_id: q.job_id, action });
});
