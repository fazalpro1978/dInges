-- Restores SECURITY DEFINER on cr_assign_smart_code.
-- 20261108_smart_code_zone_code_match.sql re-created the function without it, so it ran as the calling user and
-- was blocked by row-level security on cr_smart_code_sequences ("new row violates row-level security policy").
-- Logic is identical to 20261108; only the security attributes change.

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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id   UUID;
  v_existing_sc   TEXT;
  v_seq           INTEGER;
  v_smart_code    TEXT;
  v_zone_int      INTEGER := CASE WHEN p_zone_code ~ '^[0-9]+$' THEN p_zone_code::INTEGER ELSE NULL END;
BEGIN
  SELECT id, smart_code
  INTO v_existing_id, v_existing_sc
  FROM public.units
  WHERE lower(btrim(realtor_name)) = lower(btrim(p_realtor))
    AND lower(btrim(property))     = lower(btrim(p_property))
    AND lower(btrim(unit_no))      = lower(btrim(p_unit_no))
    AND (
      (v_zone_int IS NOT NULL AND zone_code = v_zone_int)
      OR lower(btrim(zone)) = lower(btrim(p_zone_name))
    )
  ORDER BY created_at ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'action',     'patch',
      'unit_id',    v_existing_id,
      'smart_code', v_existing_sc
    );
  END IF;

  INSERT INTO public.cr_smart_code_sequences (entity_code, zone_code, type_code, last_seq, updated_at)
  VALUES (p_entity, p_zone_code, p_type_code, 1, now())
  ON CONFLICT (entity_code, zone_code, type_code)
  DO UPDATE SET
    last_seq   = cr_smart_code_sequences.last_seq + 1,
    updated_at = now()
  RETURNING last_seq INTO v_seq;

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
