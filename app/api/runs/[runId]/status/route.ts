import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

export async function GET(
  _req: NextRequest,
  { params }: { params: { runId: string } },
) {
  const { runId } = params;

  const { data: run, error } = await admin
    .from('upload_runs')
    .select('status, approved_count, exported_count')
    .eq('id', runId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also check vetted_records directly — upload_runs.status may lag if REIMS
  // acknowledged records from a mixed queue containing multiple runs.
  const { count: totalVetted } = await admin
    .from('vetted_records')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', runId);

  const { count: ackedVetted } = await admin
    .from('vetted_records')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', runId)
    .not('acknowledged_at', 'is', null);

  const allAcknowledged =
    (totalVetted ?? 0) > 0 && (ackedVetted ?? 0) >= (totalVetted ?? 0);

  return NextResponse.json({ ...run, allAcknowledged });
}
