-- Audit log for Master Code prefix / unit-conflict overrides made in AXIOM Match & Review.
-- (public.cr_code_overrides is a different, unrelated table for unit field-change overrides.)
CREATE TABLE IF NOT EXISTS public.cr_master_code_overrides (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix        CHAR(8)     NOT NULL,
  smart_code    VARCHAR(16) NOT NULL,   -- unit smart_code, or the 16-digit master code for a prefix-level override
  reason        TEXT        NOT NULL,
  property_ref  TEXT,
  overridden_by UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cr_master_code_overrides_prefix_idx ON public.cr_master_code_overrides (prefix);
GRANT ALL ON public.cr_master_code_overrides TO service_role, authenticated;
