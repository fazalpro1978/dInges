import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Public schema — reads/writes REIMS' shared realtors registry
const reims = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Generates a unique 3-char entity code for cr_entity_codes sync
async function generateEntityCode(name: string): Promise<string | null> {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(3, '0');
  const candidates = [
    base.slice(0, 3),
    base[0] + base.slice(2, 4),
    base[0] + (base[Math.floor(base.length / 2)] ?? '0') + (base[base.length - 1] ?? '0'),
  ].map(c => c.slice(0, 3).padEnd(3, '0').toUpperCase());

  for (const code of candidates) {
    const { data } = await reims.from('cr_entity_codes').select('entity_code').eq('entity_code', code).limit(1).maybeSingle();
    if (!data) return code;
  }
  for (let i = 0; i < 20; i++) {
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    const { data } = await reims.from('cr_entity_codes').select('entity_code').eq('entity_code', rand).limit(1).maybeSingle();
    if (!data) return rand;
  }
  return null;
}

// Syncs a realtor into cr_entity_codes so Code Registry Developer/Company picks it up
async function syncToEntityCodes(name: string, classification: string | null): Promise<void> {
  const { data: existing } = await reims
    .from('cr_entity_codes')
    .select('entity_code')
    .ilike('company_name', name)
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const entityCode = await generateEntityCode(name);
  if (!entityCode) return;

  await reims.from('cr_entity_codes').insert({
    entity_code: entityCode,
    company_name: name,
    classification: classification || 'Independent',
    is_manual: true,
  });
}

export async function GET() {
  const { data, error } = await reims
    .from('realtors')
    .select('id, name, moci_id, classification')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ realtors: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, name, moci_id, classification } = body as {
    id?: string;
    name?: string;
    moci_id?: string | null;
    classification?: string | null;
  };
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  const row = {
    name: name.trim(),
    moci_id: moci_id?.trim() || null,
    classification: classification?.trim() || null,
  };
  const { data, error } = id
    ? await reims.from('realtors').update(row).eq('id', id).select('id, name, moci_id, classification').single()
    : await reims.from('realtors').insert(row).select('id, name, moci_id, classification').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Dual-write: sync new realtor into cr_entity_codes for Code Registry
  if (!id) {
    syncToEntityCodes(data.name, data.classification).catch(() => {});
  }

  return NextResponse.json({ realtor: data });
}
