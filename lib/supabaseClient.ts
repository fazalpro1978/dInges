import { createClient } from '@supabase/supabase-js';

// Single shared client — prevents "Multiple GoTrueClient instances" warning
const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default supabaseClient;
