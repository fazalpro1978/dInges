-- Delta ingestion pipeline
-- Adds: system_status_lookup, delta_status columns, orphaned_count, MC RPCs

-- ── 1. Status lookup table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.system_status_lookup (
  code        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'general',
  created_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.system_status_lookup (code, label, description, category) VALUES
  ('ST_NEW',       'New Record',  'No REIMS match — new Smart Code + Master Code assigned',                              'delta'),
  ('ST_UPDATED',   'Updated',     'REIMS match with field change(s) — data patched, MC DDMMTIME suffix refreshed',       'delta'),
  ('ST_UNCHANGED', 'No Update',   'REIMS match, identical fields — data locked, MC timestamp preserved',                 'delta'),
  ('ST_LOOK_UP',   'Look Up',     'In REIMS but absent from source file — verify current leasing status manually',       'delta')
ON CONFLICT (code) DO NOTHING;

-- ── 2. delta_status column on staged_records ──────────────────────────────────

ALTER TABLE ingest.staged_records
  ADD COLUMN IF NOT EXISTS delta_status TEXT
  CHECK (delta_status IN ('ST_NEW','ST_UPDATED','ST_UNCHANGED'));

-- ── 3. delta_status column on vetted_records ──────────────────────────────────

ALTER TABLE ingest.vetted_records
  ADD COLUMN IF NOT EXISTS delta_status TEXT;

-- ── 4. orphaned_count on upload_runs ─────────────────────────────────────────

ALTER TABLE ingest.upload_runs
  ADD COLUMN IF NOT EXISTS orphaned_count INT NOT NULL DEFAULT 0;

-- ── 5. source column on cr_master_registry ───────────────────────────────────

ALTER TABLE public.cr_master_registry
  ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'axiom'
  CHECK (source IN ('axiom','direct','delta'));

-- ── 6. RPC: refresh MC DDMMTIME suffix for a single unit (GREEN / ST_UPDATED) ─

CREATE OR REPLACE FUNCTION public.cr_refresh_master_code_timestamp(
  p_unit_id    UUID,
  p_run_ddmm   CHAR(4),   -- e.g. '1809'
  p_run_hhmm   CHAR(4)    -- e.g. '1735'
) RETURNS VARCHAR(16)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_old_mc  VARCHAR(16);
  v_prefix  CHAR(8);
  v_new_mc  VARCHAR(16);
BEGIN
  SELECT master_code INTO v_old_mc FROM public.units WHERE id = p_unit_id;
  IF v_old_mc IS NULL OR length(v_old_mc) <> 16 THEN RETURN NULL; END IF;

  v_prefix := LEFT(v_old_mc, 8);           -- Cat+Entity+Agent+Zone (immutable)
  v_new_mc := v_prefix || p_run_ddmm || p_run_hhmm;

  UPDATE public.units
  SET master_code = v_new_mc
  WHERE id = p_unit_id;

  RETURN v_new_mc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cr_refresh_master_code_timestamp TO service_role;

-- ── 7. RPC: generate + register a Master Code for a new unit (YELLOW / ST_NEW)

CREATE OR REPLACE FUNCTION public.cr_generate_master_code(
  p_category    CHAR(1),
  p_entity_code VARCHAR(3),
  p_agent_code  CHAR(2),
  p_zone_code   VARCHAR(2),
  p_run_ddmm    CHAR(4),
  p_run_hhmm    CHAR(4),
  p_property_ref TEXT  DEFAULT NULL,
  p_created_by   UUID  DEFAULT NULL
) RETURNS VARCHAR(16)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_mc VARCHAR(16);
BEGIN
  v_mc := p_category
       || p_entity_code
       || p_agent_code
       || LPAD(p_zone_code, 2, '0')
       || p_run_ddmm
       || p_run_hhmm;

  INSERT INTO public.cr_master_registry
    (master_code, category, entity_code, agent_code, zone_code,
     date_seg, time_seg, source, property_ref, created_by)
  VALUES
    (v_mc, p_category, p_entity_code, p_agent_code, p_zone_code,
     p_run_ddmm, p_run_hhmm, 'delta', p_property_ref, p_created_by)
  ON CONFLICT (master_code) DO NOTHING;

  RETURN v_mc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cr_generate_master_code TO service_role;
