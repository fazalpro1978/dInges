import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/serverAuth';
import { registry } from '@/lib/registryClient';

const VALID_REASON_CODES = new Set([
  'CONFIG_MISMATCH', 'ENTITY_MISMATCH', 'ZONE_MISMATCH', 'AGENT_MISMATCH',
  'DUPLICATE_OVERRIDE', 'RE_UPLOAD_UPDATE', 'SOURCE_ERROR', 'SYSTEM_ERROR', 'OTHER',
]);

// Strict override capture — fires on every post-generation code edit in Stage 2.
// Writes to cr_code_overrides AND cr_registry_history.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { registry_id, smart_code, reason_code, reason_text, field_changed, value_before, value_after } = await req.json();

  if (!VALID_REASON_CODES.has(reason_code)) {
    return NextResponse.json({ error: `Invalid reason_code: ${reason_code}` }, { status: 400 });
  }
  if (!registry_id || !smart_code || !field_changed) {
    return NextResponse.json({ error: 'registry_id, smart_code, and field_changed are required' }, { status: 400 });
  }

  const { error: overrideErr } = await registry.from('cr_code_overrides').insert({
    registry_id,
    smart_code,
    override_by:   auth.uid,
    reason_code,
    reason_text:   reason_text  ?? null,
    field_changed,
    value_before:  value_before ?? null,
    value_after:   value_after  ?? null,
  });
  if (overrideErr) return NextResponse.json({ error: overrideErr.message }, { status: 500 });

  await registry.from('cr_registry_history').insert({
    registry_id,
    smart_code,
    from_status: 'active',
    to_status:   'active',
    changed_by:  auth.uid,
    notes:       `Field override: ${field_changed} — ${reason_code}${reason_text ? ' — ' + reason_text : ''}`,
  });

  return NextResponse.json({ ok: true });
}
