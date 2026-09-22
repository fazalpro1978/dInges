import { createClient } from '@supabase/supabase-js';

// Centralised registry client used for Zone/District and Realtor look-ups.
// In production, set REGISTRY_SUPABASE_URL + REGISTRY_SERVICE_ROLE_KEY to the
// same Supabase project used by REIMS so both applications share one live copy
// of cr_zone_codes and realtors — any write from either system is immediately
// visible in the other.  Falls back to the app's own DB when these vars are
// absent (local dev or standalone deployment).
export const registry = createClient(
  process.env.REGISTRY_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.REGISTRY_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
