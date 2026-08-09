-- Add 'killed' to the batch_logs phase check constraint.
-- Killed batches are admin-terminated sessions that never reached REIMS.

ALTER TABLE ingest.batch_logs DROP CONSTRAINT batch_logs_phase_check;

ALTER TABLE ingest.batch_logs
  ADD CONSTRAINT batch_logs_phase_check
  CHECK (phase IN ('uploaded', 'review_approve', 'done', 'failed', 'killed'));
