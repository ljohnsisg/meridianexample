# Flightpath

AI-driven career placement for low-time pilots. Upload a logbook + certs,
see the jobs you qualify for, get application help.

> **Start here if you're using Claude Code:** open this folder and read
> `CLAUDE.md` first — it holds the architecture, the one governing rule
> ("AI extracts, code decides"), conventions, and the build roadmap.

## Quickstart

```bash
# 0. prerequisites: Node 18+, Supabase CLI, a Supabase project, an Anthropic API key
npm install

# 1. env
cp .env.example .env            # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY

# 2. database
supabase link --project-ref <your-ref>
supabase db push                # applies migrations (schema + qualifying_jobs)

# 3. edge function secrets + deploy
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... INGEST_SECRET=$(openssl rand -hex 24)
supabase functions deploy ingest-job
supabase functions deploy review-action

# 4. seed a few jobs through the AI pipeline
export SUPABASE_URL=https://<ref>.supabase.co
export INGEST_SECRET=<the value you set>
bash scripts/seed-jobs.sh

# 5. run the app
npm run dev                     # http://localhost:5173
```

## What's here

- **Backend, working:** the AI job-ingestion pipeline + deterministic matching
  (`supabase/`). See `docs/ingestion.md`.
- **Frontend, minimal:** a Vite/React starting point with a live job board page
  that calls the `qualifying_jobs` RPC (`src/`). Extend from the prototype.
- **Design spec:** `public/prototype.html` — the full clickable UX to build toward.

## Next

Follow the roadmap in `CLAUDE.md`. Good first Claude Code prompt:
*"Read CLAUDE.md, then implement roadmap step 1 (auth + pilots table + profile),
following the deterministic-eligibility rule."*
