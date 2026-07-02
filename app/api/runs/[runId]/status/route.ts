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

  // Primary check: upload_runs.status='exported' means REIMS acknowledged successfully.
  // This is the authoritative signal — if it's set, advance regardless of vetted_records.
  if (run?.status === 'exported') {
    return NextResponse.json({ ...run, total: run.exported_count ?? 0, acked: run.exported_count ?? 0, allAcknowledged: true });
  }

  // Fallback: count acknowledged vetted records directly
  const { data: vetted, error: vErr } = await admin
    .from('vetted_records')
    .select('id, acknowledged_at')
    .eq('run_id', runId);

  const total = vetted?.length ?? 0;
  const acked = vetted?.filter((r: { acknowledged_at: string | null }) => r.acknowledged_at !== null).length ?? 0;
  const allAcknowledged = !vErr && total > 0 && acked >= total;

  return NextResponse.json({ ...run, total, acked, allAcknowledged });
}
