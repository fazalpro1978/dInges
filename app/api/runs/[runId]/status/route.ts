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

  // Fetch upload_runs and batch_logs phase in parallel.
  // Use maybeSingle() on upload_runs so a missing row returns null instead of an error —
  // a hard .single() error was causing a 500 that prevented the batch_logs secondary check from ever running.
  const [{ data: run }, { data: batchLogs }] = await Promise.all([
    admin.from('upload_runs').select('status, approved_count, exported_count').eq('id', runId).maybeSingle(),
    admin.from('batch_logs').select('phase').eq('run_id', runId).order('created_at', { ascending: false }).limit(1),
  ]);

  const batchPhase = batchLogs?.[0]?.phase ?? null;

  // Primary: upload_runs.status = 'exported'
  if (run?.status === 'exported') {
    return NextResponse.json({ ...run, total: run.exported_count ?? 0, acked: run.exported_count ?? 0, allAcknowledged: true });
  }

  // Secondary: batch_logs.phase = 'done' — acknowledge route sets this after writing all records
  if (batchPhase === 'done') {
    // Use exported_count when available; otherwise count vetted_records directly
    if (run?.exported_count && run.exported_count > 0) {
      return NextResponse.json({ ...run, total: run.exported_count, acked: run.exported_count, allAcknowledged: true });
    }
    const { count: vCount } = await admin
      .from('vetted_records')
      .select('id', { count: 'exact', head: true })
      .eq('run_id', runId);
    const n = vCount ?? 0;
    return NextResponse.json({ ...run, exported_count: n, total: n, acked: n, allAcknowledged: true });
  }

  // Tertiary: count acknowledged vetted records directly
  const { data: vetted, error: vErr } = await admin
    .from('vetted_records')
    .select('id, acknowledged_at')
    .eq('run_id', runId);

  const total = vetted?.length ?? 0;
  const acked = vetted?.filter((r: { acknowledged_at: string | null }) => r.acknowledged_at !== null).length ?? 0;
  const allAcknowledged = !vErr && total > 0 && acked >= total;

  return NextResponse.json({ ...run, total, acked, allAcknowledged, _batchPhase: batchPhase, _vErr: vErr?.message ?? null });
}
