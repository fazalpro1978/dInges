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
