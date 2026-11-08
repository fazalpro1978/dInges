import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/serverAuth';
import { registry } from '@/lib/registryClient';

type BatchUnit = { property: string; unit_no: string };

const nk = (p: unknown, u: unknown) =>
  `${String(p ?? '').toLowerCase().trim()}||${String(u ?? '').toLowerCase().trim()}`;

// Phase 1 — read-only prefix + unit check. No writes.
// prefix = first 8 chars: Category(1)+Entity(3)+Agent(2)+Zone(2)
// A prefix hit is a notice (prefix is shared by every property of that realtor/agent/zone).
// A unit conflict is a batch unit (realtor + property + unit_no) that already exists in REIMS.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as
    { prefix?: string; realtor_name?: string; units?: BatchUnit[] } | null;
  const prefix = body?.prefix ?? '';
  if (prefix.length !== 8) {
    return NextResponse.json({ error: 'prefix must be 8 characters' }, { status: 400 });
  }
  const units = (body?.units ?? []).filter(u => u?.property && u?.unit_no);
  const realtor = String(body?.realtor_name ?? '').toLowerCase().trim();

  const { data: regData, error: regErr } = await registry
    .from('cr_master_registry')
    .select('master_code, category, entity_code, agent_code, zone_code, date_seg, time_seg, created_at, property_ref')
    .like('master_code', `${prefix}%`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });

  const unitConflicts: string[] = [];
  const conflictKeys: string[] = [];

  if (units.length > 0) {
    const properties = Array.from(new Set(units.map(u => u.property)));
    const { data: existing, error: unitErr } = await registry
      .from('units')
      .select('smart_code, master_code, realtor_name, property, unit_no')
      .in('property', properties);
    if (unitErr) return NextResponse.json({ error: unitErr.message }, { status: 500 });

    const batchKeys = new Set(units.map(u => nk(u.property, u.unit_no)));
    for (const e of existing ?? []) {
      const key = nk(e.property, e.unit_no);
      if (!batchKeys.has(key)) continue;
      if (realtor && String(e.realtor_name ?? '').toLowerCase().trim() !== realtor) continue;
      conflictKeys.push(key);
      unitConflicts.push(
        (e.smart_code as string | null) ?? (e.master_code as string | null) ?? `${e.property} / ${e.unit_no}`,
      );
    }

    // Legacy hyphenated smart codes (prefix-unit_no)
    const legacy = units.map(u => `${prefix}-${u.unit_no}`);
    const { data: legacyRows } = await registry.from('units').select('smart_code, property, unit_no').in('smart_code', legacy);
    for (const l of legacyRows ?? []) {
      const sc = l.smart_code as string | null;
      if (sc && !unitConflicts.includes(sc)) {
        unitConflicts.push(sc);
        conflictKeys.push(nk(l.property, l.unit_no));
      }
    }
  }

  return NextResponse.json({
    hasConflict: (regData?.length ?? 0) > 0 || unitConflicts.length > 0,
    matches:      regData ?? [],
    unitConflicts,
    conflictKeys,
  });
}
