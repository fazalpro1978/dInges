-- ─────────────────────────────────────────────────────────────────────────────
-- Smart Code Pipeline v2
-- Eliminates duplicate smart_codes by replacing unit_no suffix with an
-- atomic sequence counter scoped to [entity_code + zone_code + type_code].
-- New format: {Cat(1)}{Entity(3)}{Agent(2)}{Zone(2)}{Type(2)}{Seq(4)} = 14 chars
-- Example: RAEMSB552B0001
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. DynamicTypeMapping: config → 2-char type code lookup ──────────────────

CREATE TABLE IF NOT EXISTS public.cr_property_type_configs (
  config_key  TEXT    UNIQUE NOT NULL,
  type_code   CHAR(2) NOT NULL,
  description TEXT
);

INSERT INTO public.cr_property_type_configs (config_key, type_code, description) VALUES
  ('Studio',    'ST', 'Studio unit'),
  ('1 BHK',     '1B', '1-bedroom'),
  ('2 BHK',     '2B', '2-bedroom'),
  ('3 BHK',     '3B', '3-bedroom'),
  ('4 BHK',     '4B', '4-bedroom'),
  ('5 BHK',     '5B', '5-bedroom'),
  ('6 BHK',     '6B', '6-bedroom'),
  ('Office',    'OF', 'Office unit'),
  ('Penthouse', 'PH', 'Penthouse'),
  ('Duplex',    'DX', 'Duplex'),
  ('Villa',     'VL', 'Villa')
ON CONFLICT (config_key) DO NOTHING;

-- ── 2. SequenceGenerator: atomic counter per [entity + zone + type] bucket ───

CREATE TABLE IF NOT EXISTS public.cr_smart_code_sequences (
  entity_code  VARCHAR(3) NOT NULL,
  zone_code    VARCHAR(2) NOT NULL,
  type_code    CHAR(2)    NOT NULL,
  last_seq     INTEGER    NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ        DEFAULT now(),
  PRIMARY KEY (entity_code, zone_code, type_code)
);

-- ── 3. RPC: NaturalKeyDeduplication + SequenceGenerator in one transaction ───
--    Returns: { action: 'patch', unit_id, smart_code } — unit already exists
--          or { action: 'new',   smart_code, seq }     — new unique code assigned

CREATE OR REPLACE FUNCTION public.cr_assign_smart_code(
  p_category   CHAR(1),
  p_entity     VARCHAR(3),
  p_agent      CHAR(2),
  p_zone_code  VARCHAR(2),
  p_type_code  CHAR(2),
  p_realtor    TEXT,
  p_property   TEXT,
  p_unit_no    TEXT,
  p_zone_name  TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_id   UUID;
  v_existing_sc   TEXT;
  v_seq           INTEGER;
  v_smart_code    TEXT;
BEGIN
  -- NaturalKeyDeduplication: check [realtor + property + unit_no + zone]
  SELECT id, smart_code
  INTO v_existing_id, v_existing_sc
  FROM public.units
  WHERE realtor_name = p_realtor
    AND property     = p_property
    AND unit_no      = p_unit_no
    AND zone         = p_zone_name
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'action',     'patch',
      'unit_id',    v_existing_id,
      'smart_code', v_existing_sc
    );
  END IF;

  -- Atomic counter increment for this [entity + zone + type] bucket
  INSERT INTO public.cr_smart_code_sequences (entity_code, zone_code, type_code, last_seq, updated_at)
  VALUES (p_entity, p_zone_code, p_type_code, 1, now())
  ON CONFLICT (entity_code, zone_code, type_code)
  DO UPDATE SET
    last_seq   = cr_smart_code_sequences.last_seq + 1,
    updated_at = now()
  RETURNING last_seq INTO v_seq;

  -- 14-char smart_code: Cat+Entity+Agent+Zone+Type+Seq (no hyphen)
  v_smart_code := p_category
               || p_entity
               || p_agent
               || p_zone_code
               || p_type_code
               || LPAD(v_seq::TEXT, 4, '0');

  RETURN jsonb_build_object(
    'action',     'new',
    'smart_code', v_smart_code,
    'seq',        v_seq
  );
END;
$$;

-- ── 4. Index for fast natural-key dedup lookups ───────────────────────────────

CREATE INDEX IF NOT EXISTS idx_units_natural_key
  ON public.units (realtor_name, property, unit_no, zone);

-- ── 5. DatabaseConstraint: deduplicate existing rows then apply UNIQUE ────────
--    Existing duplicates (e.g. multiple rows with RAEMSB55-1) are nulled out;
--    they will receive correct smart_codes when re-imported through this pipeline.

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY smart_code
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.units
  WHERE smart_code IS NOT NULL
)
UPDATE public.units SET smart_code = NULL
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'units_smart_code_unique'
      AND table_name = 'units'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.units ADD CONSTRAINT units_smart_code_unique UNIQUE (smart_code);
  END IF;
END;
$$;
