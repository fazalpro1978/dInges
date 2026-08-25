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

  // Query 1: master registry — property-level conflict
  const { data: regData, error: regErr } = await registry
    .from('cr_master_registry')
    .select('master_code, category, entity_code, agent_code, zone_code, date_seg, time_seg, created_at, property_ref')
    .like('master_code', `${prefix}%`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });

  // Query 2: units table — unit-level conflict (smart_code = prefix-unit_no)
  const { data: unitData } = await registry
    .from('units')
    .select('smart_code')
    .like('smart_code', `${prefix}-%`)
    .limit(50);

  const unitConflicts: string[] = (unitData ?? [])
    .map(u => u.smart_code as string)
    .filter(Boolean);

  return NextResponse.json({
    hasConflict: (regData?.length ?? 0) > 0,
    matches:      regData ?? [],
    unitConflicts,
  });
}
