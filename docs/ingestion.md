# Flightpath — AI job ingestion pipeline

Turns any raw pilot job posting (JSfirm feed text, Adzuna JSON, a forwarded
employer email, a scraped page, a pasted blurb) into a clean, structured,
matchable job row — with a confidence gate and human review queue.

**Design principle: AI extracts, code decides.**
The model fills descriptive fields and *proposes* the eligibility-critical ones
(`min_total_hours`, `required_certificate`). Deterministic code validates them,
routes low-confidence rows to review, and — critically — the pilot↔job
eligibility gate is plain SQL (`qualifying_jobs`), never a model call.

## Flow

```
raw posting ──► raw_job_intake (dedupe by content_hash)
                     │
             extractJob() Haiku ──low confidence?──► retry Sonnet
                     │
             normalizeAndGate()  (cert maps? hours plausible?
                     │            critical fields? conf ≥ 0.80?)
              ┌──────┴──────┐
        auto_approved   pending_review
         published=true   → job_review_queue → review-action (approve/reject)
```

## Files

| Path | What |
|---|---|
| `migrations/0001_job_ingestion.sql` | tables, enums, RLS |
| `migrations/0002_matching.sql` | `qualifying_jobs()` — deterministic eligibility |
| `functions/_shared/extraction.ts` | Anthropic tool-use structured extraction |
| `functions/_shared/normalize.ts` | normalization + review gate (the rules) |
| `functions/_shared/hash.ts` | dedupe hashing |
| `functions/ingest-job/index.ts` | intake → extract → gate → publish/queue |
| `functions/review-action/index.ts` | approve/reject queued jobs |

## Setup

```bash
supabase db push                      # apply migrations
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  INGEST_SECRET=$(openssl rand -hex 24)
supabase functions deploy ingest-job
supabase functions deploy review-action
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## Ingest a posting

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/ingest-job" \
  -H "x-ingest-secret: $INGEST_SECRET" \
  -H "content-type: application/json" \
  -d '{
    "raw_text": "Redtail Geospatial is hiring an Aerial Survey Pilot. Cessna 207. Minimum 500 hours total time, Commercial certificate required. Regional US, seasonal, $52-60k. Great time builder, low-time friendly."
  }'
# -> { "job_id": "...", "review_status": "auto_approved", "published": true,
#      "model": "claude-haiku-4-5-20251001", "confidence": 0.94, "reasons": [] }
```

## Query matches (deterministic)

```sql
select * from qualifying_jobs(268, array['cpl','cfi','instrument']::cert_level[]);
```

## Wiring in sources

Each source just needs to POST `raw_text` to `ingest-job`:

- **Employer post form** — your "Post a job" UI submits the free-text description.
- **Email** — inbound-email webhook (e.g. Resend/Postmark) forwards the body.
- **JSfirm / Adzuna** — a scheduled function pulls the feed and posts each item.
- **Manual** — admin paste box.

The same extraction handles all of them, so adding a source ≈ zero parser code.

## Cost / models

- Extraction runs on **Haiku** (`claude-haiku-4-5`) by default — cheap, fast,
  fine for structured pulls. Only low-confidence items escalate to **Sonnet**.
- Budget guidance: a few tenths of a cent per posting at MVP volume.
- Never call an LLM where SQL suffices — matching, counting, filtering stay in Postgres.

## Next

- `pgvector` embedding on `jobs.embedding` for semantic ranking of the *already-eligible* set.
- Cert-image extraction Edge Function (vision) reusing this same gate pattern.
- Conversational agent that calls `qualifying_jobs` + coaching as tools.
