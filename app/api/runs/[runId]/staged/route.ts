import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

export async function GET(_req: NextRequest, { params }: { params: { runId: string } }) {
  const { runId } = params;
  const { data, error } = await admin
    .from('staged_records')
    .select('*')
    .eq('run_id', runId)
    .order('row_index', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ records: data ?? [] });
}
