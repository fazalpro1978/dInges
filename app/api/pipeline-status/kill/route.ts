import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

export async function POST(req: NextRequest) {
  try {
    const { runId, batchId } = (await req.json()) as { runId?: string; batchId?: string };
    if (!runId && !batchId) return NextResponse.json({ error: 'runId or batchId required' }, { status: 400 });

    const now = new Date().toISOString();

    // Kill the batch_log entry — prefer run_id match (covers all logs for the run),
    // fall back to batch_id for old entries where run_id is null.
    const batchUpdate = runId
      ? admin.from('batch_logs').update({ phase: 'cancelled', done_at: now }).eq('run_id', runId)
      : admin.from('batch_logs').update({ phase: 'cancelled', done_at: now }).eq('batch_id', batchId!);

    await Promise.all([
      batchUpdate,
      ...(runId ? [admin.from('upload_runs').update({ status: 'cancelled' }).eq('id', runId)] : []),
    ]);

    return NextResponse.json({ cancelled: true, runId: runId ?? null, batchId: batchId ?? null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kill failed' },
      { status: 500 },
    );
  }
}
