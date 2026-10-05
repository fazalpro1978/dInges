-- Manually assignable code fields on batch_logs
-- Allows administrators to stamp a 16-digit Master Code and 14-char Smart Code
-- per completed batch via the Batch History UI.

ALTER TABLE ingest.batch_logs
  ADD COLUMN IF NOT EXISTS master_code TEXT,
  ADD COLUMN IF NOT EXISTS smart_code  TEXT;

COMMENT ON COLUMN ingest.batch_logs.master_code IS '16-digit Master Code manually assigned to this batch by an administrator';
COMMENT ON COLUMN ingest.batch_logs.smart_code  IS '14-character unit Smart Code manually assigned to this batch by an administrator';
