import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/serverAuth';
import { registry } from '@/lib/registryClient';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { prefix, smart_codes, reason, property_ref } = await req.json() as {
    prefix: string;
    smart_codes: string[];
    reason: string;
    property_ref?: string | null;
  };

  if (!prefix || !Array.isArray(smart_codes) || smart_codes.length === 0 || !reason?.trim()) {
    return NextResponse.json({ error: 'prefix, smart_codes[], and reason required' }, { status: 400 });
  }

  const rows = smart_codes.map(sc => ({
    prefix,
    smart_code:    sc,
    reason:        reason.trim(),
    property_ref:  property_ref ?? null,
    overridden_by: auth.uid,
  }));

  const { error } = await registry.from('cr_code_overrides').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logged: rows.length }, { status: 201 });
}
