import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/serverAuth';
import { createClient } from '@supabase/supabase-js';

const serviceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

// Returns the logged-in user's profile including agent_code (added in Phase 0 migration).
// Used by the Code Registry panel to pre-populate the Assigned To field.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { data: profile } = await serviceClient()
    .from('profiles')
    .select('role, full_name, agent_code')
    .eq('id', auth.uid)
    .single();

  return NextResponse.json({
    uid:        auth.uid,
    role:       auth.role,
    full_name:  profile?.full_name  ?? '',
    agent_code: profile?.agent_code ?? '',
  });
}
