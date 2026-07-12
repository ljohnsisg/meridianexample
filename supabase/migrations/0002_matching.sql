-- ============================================================
-- 0002_matching.sql
-- The eligibility gate lives in SQL, NOT in the model.
-- A pilot "qualifies" iff they meet the hours AND hold the cert.
-- The AI never decides this — it only ranks the already-eligible set.
-- ============================================================

-- Returns published jobs with a qualifies flag + a shortfall,
-- given a pilot's total hours and the certificates they hold.
create or replace function qualifying_jobs(
  p_total_hours integer,
  p_certs       cert_level[]
)
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
  hours_short          integer,      -- >0 means N hours short; 0 if met
  cert_ok              boolean
)
language sql stable as $$
  select
    j.id, j.employer, j.role_title, j.role_type,
    j.min_total_hours, j.required_certificate, j.location, j.pay_raw,
    -- qualifies: cert held (or none required) AND hours met (or unspecified)
    (
      (j.required_certificate = 'none' or j.required_certificate = any(p_certs))
      and (j.min_total_hours is null or p_total_hours >= j.min_total_hours)
    ) as qualifies,
    greatest(coalesce(j.min_total_hours, 0) - p_total_hours, 0) as hours_short,
    (j.required_certificate = 'none' or j.required_certificate = any(p_certs)) as cert_ok
  from jobs j
  where j.published = true
    and j.review_status in ('auto_approved','approved')
  order by qualifies desc, j.min_total_hours asc nulls first;
$$;

-- Example:
--   select * from qualifying_jobs(268, array['cpl','cfi','instrument']::cert_level[]);
