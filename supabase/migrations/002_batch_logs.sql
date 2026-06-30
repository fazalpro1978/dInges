-- ─────────────────────────────────────────────────────────────────────────────
-- REIMS Ingestion Service — Batch Audit Log
-- Extends the ingest schema with a dedicated forensic traceability table
-- tracking every batch through the full pipeline lifecycle.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Batch logs ────────────────────────────────────────────────────────────────
-- One row per uploaded batch. Created at staging, updated at each pipeline
-- phase transition. Provides administrative look-back and error forensics.

CREATE TABLE IF NOT EXISTS ingest.batch_logs (
  batch_id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                UUID         UNIQUE REFERENCES ingest.upload_runs(id) ON DELETE SET NULL,
  file_name             TEXT         NOT NULL,
  uploaded_by           TEXT         NOT NULL DEFAULT 'Administrator',
  phase                 TEXT         NOT NULL DEFAULT 'uploaded'
                                     CHECK (phase IN ('uploaded','review_approve','done','failed')),
  record_count_total    INTEGER      NOT NULL DEFAULT 0,
  record_count_success  INTEGER      NOT NULL DEFAULT 0,
  record_count_failed   INTEGER      NOT NULL DEFAULT 0,
  -- JSONB array of { row, field, value, error } anomaly descriptors
  -- mapped to master schema field keys for deterministic look-back
  error_summary_payload JSONB        NOT NULL DEFAULT '[]'::jsonb,
  uploaded_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  review_approve_at     TIMESTAMPTZ,
  done_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_logs_run_id     ON ingest.batch_logs (run_id);
CREATE INDEX IF NOT EXISTS idx_batch_logs_phase       ON ingest.batch_logs (phase);
CREATE INDEX IF NOT EXISTS idx_batch_logs_uploaded_by ON ingest.batch_logs (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_batch_logs_created_at  ON ingest.batch_logs (created_at DESC);

-- Auto-maintain updated_at
CREATE OR REPLACE FUNCTION ingest.set_batch_log_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_batch_log_updated_at ON ingest.batch_logs;
CREATE TRIGGER trg_batch_log_updated_at
  BEFORE UPDATE ON ingest.batch_logs
  FOR EACH ROW EXECUTE FUNCTION ingest.set_batch_log_updated_at();
