import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const reims = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await reims
    .from('cr_zone_codes')
    .select('zone_code, district_name, municipality')
    .order('zone_code');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ zones: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const zoneCode = Number(body.zone_code);
  const districtName = String(body.district_name ?? '').trim();
  const municipality = String(body.municipality ?? '').trim() || null;

  if (!Number.isInteger(zoneCode) || zoneCode <= 0 || !districtName) {
    return NextResponse.json({ error: 'zone_code (positive integer) and district_name are required' }, { status: 400 });
  }

  const row: Record<string, unknown> = { zone_code: zoneCode, district_name: districtName };
  if (municipality) row.municipality = municipality;

  const { data, error } = await reims
    .from('cr_zone_codes')
    .upsert(row, { onConflict: 'zone_code' })
    .select('zone_code, district_name, municipality')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ zone: data });
}
