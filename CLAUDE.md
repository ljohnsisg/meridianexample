# CLAUDE.md — Flightpath

Pilot **career-placement** platform for newly-licensed / low-time pilots.
Upload a logbook + certs → see the jobs you actually qualify for → get AI
application help. AI-driven, but with a hard rule (below).

## The one rule that governs everything

**AI extracts and reasons. Code decides eligibility.**

- The LLM parses messy job postings, logbooks, and certs, and ranks/coaches.
- Whether a pilot *qualifies* for a job is deterministic SQL
  (`qualifying_jobs`), never a model call. A pilot with 240 hr must never be
  told they meet a 250-hr minimum because a model rounded.
- Eligibility-critical fields (`min_total_hours`, `required_certificate`) are
  **typed, indexed columns**. The model may *propose* them; `normalize.ts`
  validates them; low-confidence rows go to a human review queue.

If you (Claude Code) are ever about to let an LLM output gate access, show a
listing as "qualified", or persist an unverified number as fact — stop and
route it through the deterministic layer instead.

## Stack

- **Frontend:** Vite + React + TypeScript. Router: react-router-dom.
- **Backend:** Supabase — Postgres (+ pgvector), Auth, Storage, Edge Functions (Deno/TS).
- **AI:** Anthropic API. Tiered: `claude-haiku-4-5` for high-volume extraction,
  escalate to `claude-sonnet-5` only on low confidence. Reasoning/coaching on Sonnet.
- **Hosting:** frontend on Vercel or Railway; functions on Supabase.
- Secrets (`ANTHROPIC_API_KEY`, `INGEST_SECRET`) live server-side only. **Never**
  call the Anthropic API from the browser.

## Architecture — job ingestion (built)

```
raw posting ─► raw_job_intake (dedupe by content_hash)
                    │
            extractJob() Haiku ──low conf?──► retry Sonnet
                    │
            normalizeAndGate()  cert maps? hours plausible?
                    │            critical fields? conf ≥ 0.80?
             ┌──────┴──────┐
       auto_approved   pending_review
        published=true   → job_review_queue → review-action (approve/reject)
```

Adding a new source (employer form, email, JSfirm feed, Adzuna, paste) = POST
`raw_text` to the `ingest-job` function. No per-source parser code.

## Directory map

```
src/                      React app
  lib/supabase.ts         browser client (anon key)
  lib/types.ts            shared types
  pages/JobBoard.tsx      calls qualifying_jobs RPC (deterministic matching)
supabase/
  config.toml             functions set verify_jwt=false (shared-secret auth)
  migrations/
    0001_job_ingestion.sql  tables, enums, RLS
    0002_matching.sql       qualifying_jobs() — the eligibility gate
  functions/
    _shared/extraction.ts   Anthropic tool-use structured extraction
    _shared/normalize.ts    normalization + review gate (the rules)
    _shared/hash.ts         dedupe hashing
    ingest-job/index.ts     orchestrator
    review-action/index.ts  human approve/reject
public/prototype.html     full clickable UX prototype = the design spec
scripts/seed-jobs.sh      curl sample postings through the pipeline
```

`public/prototype.html` is the **design reference** — match its look
(airport-signage display type, monospace data readouts, chart-blue/navy +
amber, flight-strip cards) when building real React pages.

## Commands

```bash
npm install
npm run dev                         # frontend at :5173
supabase db push                    # apply migrations
supabase functions deploy ingest-job
supabase functions deploy review-action
bash scripts/seed-jobs.sh           # push sample jobs through ingestion
```

## Env (.env.example → .env)

- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Functions (via `supabase secrets set`): `ANTHROPIC_API_KEY`, `INGEST_SECRET`
  (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically)

## Roadmap (build order)

1. **Auth + pilot profile** — Supabase Auth; `pilots` table; store verified hours/certs.
2. **Logbook import** — client CSV parser (ForeFlight/LogTen/MyFlightbook/CrewLounge/
   generic; logic exists in prototype). Persist parsed totals to Postgres.
3. **Cert vision extractor** — Edge Function, Anthropic vision reads cert image/PDF →
   ratings. Reuse the SAME gate pattern (propose → normalize → verify).
4. **Job board UI** — port prototype's board + filters; matching via `qualifying_jobs`.
5. **Coaching** — Edge Function: tailored tips + resume/cover letter from verified profile.
6. **Feed puller** — scheduled function pulls JSfirm/Adzuna → `ingest-job`.
7. **Conversational agent** — tool-calling over `qualifying_jobs` + coaching + profile.
8. **Employer side** — accounts, post-a-job (behind real auth, not the shared secret).

## Conventions

- Keep matching/counting/filtering in SQL. Only call an LLM for language-shaped work.
- Every displayed hour/qualification is code-computed + source-traceable, not model-authored.
- RLS on by default; public reads only `published = true` jobs.
- Prefer small, typed functions. Enums for anything bounded.
