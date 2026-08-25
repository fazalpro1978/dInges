import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/serverAuth';
import { registry } from '@/lib/registryClient';

// GET — fetch all type_codes for the Code Registry panel dropdown.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { data, error } = await registry
    .from('cr_property_type_configs')
    .select('type_code, configuration, category')
    .order('category')
    .order('configuration');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ typeConfigs: data ?? [] });
}

// POST — dynamic addition of new type_codes (admin UI "+ Add Type" button).
// Propagates immediately — no cache TTL, no restart required.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { type_code, configuration, category } = await req.json();

  if (!type_code || typeof type_code !== 'string' || type_code.trim().length !== 2) {
    return NextResponse.json({ error: 'type_code must be exactly 2 characters' }, { status: 400 });
  }
  if (!['R', 'C'].includes(category)) {
    return NextResponse.json({ error: 'category must be R or C' }, { status: 400 });
  }
  if (!configuration?.trim()) {
    return NextResponse.json({ error: 'configuration label is required' }, { status: 400 });
  }

  const { data, error } = await registry
    .from('cr_property_type_configs')
    .insert({ type_code: type_code.trim().toUpperCase(), configuration: configuration.trim(), category })
    .select()
    .single();

  if (error) {
    const msg = error.code === '23505' ? `type_code '${type_code.trim().toUpperCase()}' already exists` : error.message;
    return NextResponse.json({ error: msg }, { status: error.code === '23505' ? 409 : 500 });
  }
  return NextResponse.json({ typeConfig: data }, { status: 201 });
}
