-- Pipeline termination audit columns for batch_logs.
-- Captures who terminated the pipeline and at which stage so the kill event
-- is fully traceable in the batch history view without a separate table.

ALTER TABLE ingest.batch_logs
  ADD COLUMN IF NOT EXISTS terminated_by    TEXT,
  ADD COLUMN IF NOT EXISTS terminated_stage INTEGER;

-- Ensure staged_records GRANT is present (service_role needs explicit DML grant)
GRANT SELECT, INSERT, UPDATE, DELETE ON ingest.staged_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ingest.upload_runs    TO service_role;
