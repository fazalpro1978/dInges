import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/serverAuth';
import { registry } from '@/lib/registryClient';

// Phase 1 — read-only prefix check. No writes.
// prefix = first 8 chars: Category(1)+Entity(3)+Agent(2)+Zone(2)
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const prefix = req.nextUrl.searchParams.get('prefix') ?? '';
  if (prefix.length !== 8) {
    return NextResponse.json({ error: 'prefix must be 8 characters' }, { status: 400 });
  }

  const { data, error } = await registry
    .from('cr_master_registry')
    .select('master_code, category, entity_code, agent_code, zone_code, date_seg, time_seg, created_at, property_ref')
    .like('master_code', `${prefix}%`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    hasConflict: (data?.length ?? 0) > 0,
    matches: data ?? [],
  });
}
