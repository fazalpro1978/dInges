import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Role = 'superuser' | 'administrator' | 'staff' | 'agent' | 'public';

const serviceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

// AXIOM is SU/AD only — any authenticated user with those roles is allowed
export async function requireAuth(
  req: NextRequest,
): Promise<{ ok: true; uid: string; role: Role; agent_code: string; full_name: string; axiom_upload_authorised: boolean } | { ok: false; response: NextResponse }> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();

  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const supabase = serviceClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active, agent_code, full_name, axiom_upload_authorised')
    .eq('id', user.id)
    .single();

  if (!profile?.is_active || !['superuser', 'administrator'].includes(profile.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  if (!profile.axiom_upload_authorised) {
    return { ok: false, response: NextResponse.json({ error: 'AXIOM upload not authorised for this account' }, { status: 403 }) };
  }

  return {
    ok: true,
    uid:  user.id,
    role: profile.role as Role,
    agent_code:               (profile.agent_code               as string | null)  ?? '',
    full_name:                (profile.full_name                as string | null)  ?? '',
    axiom_upload_authorised:  (profile.axiom_upload_authorised  as boolean | null) ?? false,
  };
}

/** API key check for server-to-server calls (REIMS → AXIOM) */
export function requireApiKey(req: NextRequest): boolean {
  const key = process.env.INGEST_API_KEY;
  if (!key) return false; // Reject if key not configured
  return req.headers.get('x-api-key') === key;
}
