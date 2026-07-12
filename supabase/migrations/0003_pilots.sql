-- ============================================================
-- 0003_pilots.sql
-- Pilot profiles (roadmap step 1: Auth + pilot profile).
-- Same principle as jobs: the numbers that gate eligibility
-- (total_hours, certificates) are typed columns owned by code.
-- For now they are self-reported; the logbook import (step 2)
-- and cert vision extractor (step 3) will upgrade hours_source.
-- Nothing an LLM produces is ever written here without a gate.
-- ============================================================

-- Where did the pilot's numbers come from? Displayed everywhere
-- the hours are displayed, so every figure is source-traceable.
create type hours_source as enum ('self_reported','logbook_import','cert_verified');

create table pilots (
  id                uuid primary key references auth.users(id) on delete cascade,

  -- identity / preferences (descriptive, non-gating)
  full_name         text,
  target_role       role_type,
  home_base         text,                    -- e.g. "DFW"

  -- >>> deterministic eligibility spine (typed, code-owned) <<<
  certificates      cert_level[] not null default '{}',
  ratings           text[]       not null default '{}',  -- matches jobs.other_requirements vocab
  total_hours       integer      not null default 0 check (total_hours      >= 0),
  pic_hours         integer      not null default 0 check (pic_hours        >= 0),
  xc_hours          integer      not null default 0 check (xc_hours         >= 0),
  night_hours       integer      not null default 0 check (night_hours      >= 0),
  instrument_hours  integer      not null default 0 check (instrument_hours >= 0),
  multi_hours       integer      not null default 0 check (multi_hours      >= 0),

  -- provenance
  hours_source      hours_source not null default 'self_reported',
  hours_updated_at  timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger pilots_touch before update on pilots
  for each row execute function touch_updated_at();

-- Every new auth user gets an empty pilot row automatically.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into pilots (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- RLS: pilots see and edit only themselves ----------
alter table pilots enable row level security;

create policy "pilots read own row" on pilots
  for select using (auth.uid() = id);
create policy "pilots insert own row" on pilots
  for insert with check (auth.uid() = id);
create policy "pilots update own row" on pilots
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- matching from the STORED profile ----------
-- Same deterministic gate as qualifying_jobs(), but the inputs come
-- from the pilot's persisted row (auth.uid()), not from client state.
-- The client can't inflate its hours in the request; what's saved is
-- what's matched.
create or replace function qualifying_jobs_for_pilot()
returns table (
  id                   uuid,
  employer             text,
  role_title           text,
  role_type            role_type,
  min_total_hours      integer,
  required_certificate cert_level,
  location             text,
  pay_raw              text,
  qualifies            boolean,
  hours_short          integer,
  cert_ok              boolean
)
language sql stable as $$
  select q.*
  from pilots p,
       lateral qualifying_jobs(p.total_hours, p.certificates) q
  where p.id = auth.uid();
$$;
