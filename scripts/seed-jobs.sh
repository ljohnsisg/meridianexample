#!/usr/bin/env bash
# Push sample raw postings through the AI ingestion pipeline.
# Requires env: SUPABASE_URL, INGEST_SECRET
set -euo pipefail
: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${INGEST_SECRET:?set INGEST_SECRET}"

post() {
  curl -s -X POST "$SUPABASE_URL/functions/v1/ingest-job" \
    -H "x-ingest-secret: $INGEST_SECRET" \
    -H "content-type: application/json" \
    -d "{\"raw_text\": $1}" | sed 's/^/  → /'
  echo
}

echo "Seeding sample jobs..."

post '"Meridian Flight Academy is hiring a Certified Flight Instructor (CFI). Cessna 172 / DA40. Minimum 250 hours total time, CFI required. Fort Worth, TX (KAFW). Full-time, $48k-72k plus per-flight-hour pay. Low-time friendly, great time builder, hiring now."'

post '"Redtail Geospatial: Aerial Survey Pilot. Cessna 207. Minimum 500 hours total time. Commercial certificate required. Regional US travel, seasonal. $52,000-60,000. Excellent time-building role, low-time pilots welcome."'

post '"SkyWest Airlines First Officer cadet program. CRJ / E175. 1000 hours total time (R-ATP eligible). Multiple bases. $90k+ first year, $17,500 sign-on bonus, relocation assistance. Full-time."'

post '"Coastal Banner Ads seeking a Banner Tow Pilot for the summer season. Piper PA-18 Super Cub. 300 hours minimum, Commercial certificate. Galveston, TX. $38k-46k seasonal. Tailwheel time a plus. Low-time friendly."'

post '"Priority Jet: SIC on Citation CJ3. Corporate operation, Addison TX. 1200 hours total, Commercial multi-engine instrument required. $70k-90k, type training provided, sign-on bonus, relocation."'

echo "Done. Check the jobs table / review queue in Supabase."
