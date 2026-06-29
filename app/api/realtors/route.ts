import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Public schema client — reads/writes REIMS' shared realtors registry
const reims = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  const { data, error } = await reims
    .from('realtors')
    .select('id, name, moci_id')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ realtors: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, name, moci_id } = body as { id?: string; name?: string; moci_id?: string | null };

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const row = { name: name.trim(), moci_id: moci_id?.trim() || null };

  const { data, error } = id
    ? await reims.from('realtors').update(row).eq('id', id).select('id, name, moci_id').single()
    : await reims.from('realtors').insert(row).select('id, name, moci_id').single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ realtor: data });
}
