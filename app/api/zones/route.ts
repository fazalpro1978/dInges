import { NextResponse } from 'next/server';
import { registry } from '../../../lib/registryClient';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await registry
    .from('cr_zone_codes')
    .select('zone_code, district_name, municipality, area_km2, population')
    .order('zone_code');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ zones: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const zoneCode = Number(body.zone_code);
  const districtName = String(body.district_name ?? '').trim();
  const municipality = String(body.municipality ?? '').trim() || null;

  if (!Number.isInteger(zoneCode) || zoneCode <= 0 || !districtName) {
    return NextResponse.json(
      { error: 'zone_code (positive integer) and district_name are required' },
      { status: 400 },
    );
  }

  const row: Record<string, unknown> = { zone_code: zoneCode, district_name: districtName };
  if (municipality) row.municipality = municipality;

  const { data, error } = await registry
    .from('cr_zone_codes')
    .upsert(row, { onConflict: 'zone_code' })
    .select('zone_code, district_name, municipality, area_km2, population')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cascade the district name to any units already carrying this zone_code so
  // inventory views, dashboards, and synergy cards in both AXIOM and REIMS
  // stay consistent immediately after a zone is added or renamed via import.
  await registry.from('units').update({ zone: districtName }).eq('zone_code', zoneCode);

  return NextResponse.json({ zone: data });
}
