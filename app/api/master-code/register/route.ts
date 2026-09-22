import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/serverAuth';
import { registry } from '@/lib/registryClient';

// Phase 2 — deferred batch write. Called only on gate click after Phase 1 check passes.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { master_code, category, entity_code, agent_code, zone_code, date_seg, time_seg, seq_num, property_ref, batch_id } = body;

  if (!master_code || master_code.length !== 16) {
    return NextResponse.json({ error: 'master_code must be 16 characters' }, { status: 400 });
  }
  if (!['R', 'C'].includes(category)) {
    return NextResponse.json({ error: 'category must be R or C' }, { status: 400 });
  }

  const { data, error } = await registry
    .from('cr_master_registry')
    .insert({
      master_code,
      category,
      entity_code: entity_code || null,
      agent_code:  agent_code  || null,
      zone_code:   String(zone_code).padStart(2, '0').slice(-2),
      date_seg,
      time_seg,
      seq_num:     seq_num ?? 100,
      property_ref: property_ref ?? null,
      batch_id:    batch_id ?? null,
      created_by:  auth.uid,
    })
    .select()
    .single();

  if (error) {
    const msg = error.code === '23505'
      ? `master_code '${master_code}' already exists`
      : error.message;
    return NextResponse.json({ error: msg }, { status: error.code === '23505' ? 409 : 500 });
  }

  return NextResponse.json({ masterCode: data }, { status: 201 });
}
