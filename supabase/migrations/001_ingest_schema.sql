-- ─────────────────────────────────────────────────────────────────────────────
-- REIMS Ingestion Service — Isolated Schema
-- Database: Testing Supabase (hsulqoavwmsvffsbzoan)
-- Schema: ingest (completely separate from public schema used by REIMS)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS ingest;

-- ── 1. Upload runs ────────────────────────────────────────────────────────────
-- Tracks every file uploaded into the ingestion pipeline

CREATE TABLE IF NOT EXISTS ingest.upload_runs (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  source_file   TEXT         NOT NULL,
  file_hash     TEXT         NOT NULL,
  file_size     BIGINT,
  status        TEXT         NOT NULL DEFAULT 'processing'
                             CHECK (status IN ('processing','staged','partially_approved','approved','exported','failed')),
  record_count  INT          NOT NULL DEFAULT 0,
  approved_count INT         NOT NULL DEFAULT 0,
  exported_count INT         NOT NULL DEFAULT 0,
  uploaded_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  uploaded_by   TEXT         NOT NULL DEFAULT 'Administrator',
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_hash   ON ingest.upload_runs(file_hash);
CREATE INDEX IF NOT EXISTS idx_runs_status ON ingest.upload_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_at     ON ingest.upload_runs(uploaded_at DESC);

-- ── 2. Staged records ─────────────────────────────────────────────────────────
-- One row per extracted unit record, awaiting human review and approval

CREATE TABLE IF NOT EXISTS ingest.staged_records (
  id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id          UUID         NOT NULL REFERENCES ingest.upload_runs(id) ON DELETE CASCADE,
  row_index       INT          NOT NULL,
  raw_data        JSONB        NOT NULL,   -- exactly what Claude extracted
  resolved_data   JSONB        NOT NULL,   -- after merge policy & conflict resolution
  match_type      TEXT         CHECK (match_type IN ('new','update','conflict','unresolved')),
  match_confidence DECIMAL(4,3),
  conflict_fields JSONB,                   -- {field: {existing, incoming}}
  status          TEXT         NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected')),
  reviewer_notes  TEXT,
  staged_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_staged_run    ON ingest.staged_records(run_id);
CREATE INDEX IF NOT EXISTS idx_staged_status ON ingest.staged_records(status);

-- ── 3. Vetted records ─────────────────────────────────────────────────────────
-- Approved records ready for REIMS to pull via the export API

CREATE TABLE IF NOT EXISTS ingest.vetted_records (
  id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  staged_id       UUID         REFERENCES ingest.staged_records(id) ON DELETE SET NULL,
  run_id          UUID         REFERENCES ingest.upload_runs(id) ON DELETE SET NULL,
  payload         JSONB        NOT NULL,   -- final clean record payload for REIMS
  source_file     TEXT,
  match_type      TEXT,                    -- 'new' or 'update'
  approved_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  approved_by     TEXT         NOT NULL DEFAULT 'Administrator',
  exported_at     TIMESTAMPTZ,             -- set when REIMS pulls this record
  acknowledged_at TIMESTAMPTZ             -- set when REIMS confirms successful import
);

CREATE INDEX IF NOT EXISTS idx_vetted_run         ON ingest.vetted_records(run_id);
CREATE INDEX IF NOT EXISTS idx_vetted_exported    ON ingest.vetted_records(exported_at);
CREATE INDEX IF NOT EXISTS idx_vetted_acknowledged ON ingest.vetted_records(acknowledged_at);

-- ── 4. Grants ─────────────────────────────────────────────────────────────────
GRANT USAGE  ON SCHEMA ingest TO service_role, anon, authenticated;
GRANT ALL    ON ingest.upload_runs      TO service_role, anon, authenticated;
GRANT ALL    ON ingest.staged_records   TO service_role, anon, authenticated;
GRANT ALL    ON ingest.vetted_records   TO service_role, anon, authenticated;
