import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/serverAuth';
import { createClient } from '@supabase/supabase-js';

const reims = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  // Source agents from profiles — anyone with a non-null agent_code
  const { data, error } = await reims()
    .from('profiles')
    .select('agent_code, full_name, role')
    .in('role', ['superuser', 'administrator'])
    .not('agent_code', 'is', null)
    .order('full_name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ agents: data ?? [] });
}
