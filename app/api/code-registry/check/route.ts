import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/serverAuth';
import { registry } from '@/lib/registryClient';

// Phase 1 read-only prefix check — NO database writes.
// Called client-side after Code Registry fields are filled in to surface EXISTING badges.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const prefix = req.nextUrl.searchParams.get('prefix');
  if (!prefix || prefix.length !== 10) {
    return NextResponse.json({ error: 'prefix must be exactly 10 characters' }, { status: 400 });
  }

  const { data, error } = await registry
    .from('cr_registry')
    .select('smart_code, status, building_name, floor_ref, unit_ref, created_at')
    .like('smart_code', `${prefix}%`)
    .order('smart_code');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    matches:     data ?? [],
    hasConflict: (data?.length ?? 0) > 0,
  });
}
