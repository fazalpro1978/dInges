-- Master Code Registry: global property identity codes (16-digit)
-- Format: Category(1)+Entity(3)+Agent(2)+Zone(2)+Date(4 DDMM)+Time(4 HHMM)
-- Sequence (4, starts 100) stored for log tracking only, excluded from code.

CREATE TABLE IF NOT EXISTS public.cr_master_registry (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_code  VARCHAR(16) UNIQUE NOT NULL,
  category     CHAR(1) NOT NULL CHECK (category IN ('R', 'C')),
  entity_code  VARCHAR(3) REFERENCES public.cr_entity_codes(entity_code),
  agent_code   VARCHAR(2) REFERENCES public.cr_agents(agent_code),
  zone_code    VARCHAR(2) NOT NULL,
  date_seg     CHAR(4) NOT NULL,   -- DDMM
  time_seg     CHAR(4) NOT NULL,   -- HHMM 24h
  seq_num      INTEGER NOT NULL DEFAULT 100,
  property_ref TEXT,
  batch_id     UUID,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cr_master_prefix  ON public.cr_master_registry (LEFT(master_code, 8));
CREATE INDEX IF NOT EXISTS idx_cr_master_entity  ON public.cr_master_registry (entity_code);
CREATE INDEX IF NOT EXISTS idx_cr_master_zone    ON public.cr_master_registry (zone_code);
CREATE INDEX IF NOT EXISTS idx_cr_master_created ON public.cr_master_registry (created_at DESC);
