-- ============================================================
-- 0001_job_ingestion.sql
-- Core schema for the AI-driven job ingestion pipeline.
-- Principle: AI populates the "soft" fields; eligibility-critical
-- columns (min_total_hours, required_certificate) are typed and
-- used by deterministic SQL matching — never by the model at query time.
-- ============================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists vector;      -- semantic matching (used later)

-- ---------- enums ----------
create type cert_level    as enum ('none','student','ppl','cpl','cfi','cfii','mei','atp','ratp');
create type role_type     as enum ('flight_instructor','part135_charter','regional_airline','cargo',
                                   'corporate','survey_patrol','banner_tow','tour_sightseeing','other');
create type schedule_type as enum ('full_time','part_time','seasonal','contract','unknown');
create type pay_period    as enum ('year','month','hour','flight_hour','unknown');
create type intake_status as enum ('pending','extracted','failed','duplicate');
create type review_status as enum ('auto_approved','pending_review','approved','rejected');

-- ---------- sources ----------
create table job_sources (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null check (kind in ('manual','employer_post','jsfirm_feed','adzuna','email','scrape')),
  config     jsonb not null default '{}',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- raw intake (everything lands here first) ----------
create table raw_job_intake (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid references job_sources(id),
  raw_text     text,
  raw_payload  jsonb,
  content_hash text not null,
  status       intake_status not null default 'pending',
  error        text,
  created_at   timestamptz not null default now(),
  unique (content_hash)                      -- idempotent ingest / dedupe
);

-- ---------- structured, publishable jobs ----------
create table jobs (
  id                    uuid primary key default gen_random_uuid(),
  intake_id             uuid references raw_job_intake(id),
  source_id             uuid references job_sources(id),

  -- identity
  employer              text not null,
  employer_type         text,
  role_title            text not null,
  role_type             role_type not null default 'other',

  -- >>> deterministic eligibility spine (typed, indexed, code-owned) <<<
  min_total_hours       integer,
  min_pic_hours         integer,
  required_certificate  cert_level not null default 'none',
  other_requirements    text[] not null default '{}',   -- e.g. {multi_engine,instrument}

  -- descriptive (AI-populated, non-authoritative)
  aircraft              text,
  location              text,
  location_state        text,
  relocation            boolean,
  pay_min               numeric,
  pay_max               numeric,
  pay_period            pay_period not null default 'unknown',
  pay_raw               text,
  schedule              schedule_type not null default 'unknown',
  perks                 text[] not null default '{}',
  apply_url             text,
  posted_date           date,
  summary               text,
  description           text,

  -- provenance / trust
  extraction_model      text,
  extraction_confidence numeric,             -- 0..1
  confidence_notes      text,
  review_status         review_status not null default 'pending_review',
  published             boolean not null default false,

  embedding             vector(1024),         -- filled later for semantic ranking

  content_hash          text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (content_hash)
);

create index jobs_live_idx      on jobs (published, role_type);
create index jobs_hours_idx     on jobs (min_total_hours);
create index jobs_cert_idx      on jobs (required_certificate);

-- ---------- human review queue (thin pointer + reasons) ----------
create table job_review_queue (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid references jobs(id) on delete cascade,
  reasons     text[] not null default '{}',   -- why it was flagged
  proposed    jsonb not null,                 -- raw model output snapshot
  resolved    boolean not null default false,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index review_open_idx on job_review_queue (resolved) where resolved = false;

-- ---------- updated_at trigger ----------
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
create trigger jobs_touch before update on jobs
  for each row execute function touch_updated_at();

-- ---------- RLS ----------
alter table jobs             enable row level security;
alter table raw_job_intake   enable row level security;
alter table job_review_queue enable row level security;
alter table job_sources      enable row level security;

-- anon/authenticated may read ONLY published + accepted jobs.
create policy "read published jobs" on jobs
  for select using (published = true and review_status in ('auto_approved','approved'));

-- intake, queue, sources have no anon policy => reachable only via the
-- service-role key (used by Edge Functions). Add admin policies as needed.
