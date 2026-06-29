import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const reims = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  const { data, error } = await reims
    .from('cr_zone_codes')
    .select('zone_code, district_name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ zones: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const zoneCode = Number(body.zone_code);
  const districtName = String(body.district_name ?? '').trim();
  const municipality = String(body.municipality ?? '').trim();

  if (!Number.isInteger(zoneCode) || !districtName || !municipality) {
    return NextResponse.json({ error: 'zone_code, district_name and municipality are required' }, { status: 400 });
  }

  const { data, error } = await reims
    .from('cr_zone_codes')
    .upsert({ zone_code: zoneCode, district_name: districtName, municipality }, { onConflict: 'zone_code' })
    .select('zone_code, district_name, municipality')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ zone: data });
}
