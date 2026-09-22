import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

function makeAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'ingest' } },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { jobId } = params;
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  let stage: number | null = null;
  try {
    const body = await req.json();
    stage = typeof body.stage === 'number' ? body.stage : null;
  } catch {
    // body is optional
  }

  const admin = makeAdmin();
  const now = new Date().toISOString();

  try {
    // 1. Purge staged_records for this run (rolls back uncommitted batch data)
    const { error: srErr } = await admin
      .from('staged_records')
      .delete()
      .eq('run_id', jobId);

    if (srErr) {
      return NextResponse.json(
        { error: 'Failed to purge staged records', detail: srErr.message },
        { status: 500 },
      );
    }

    // 2. Purge vetted_records if any made it that far
    const { error: vrErr } = await admin
      .from('vetted_records')
      .delete()
      .eq('run_id', jobId);

    if (vrErr && vrErr.code !== 'PGRST116') {
      // Ignore "no rows" errors; only fail on real DB errors
      console.error('vetted_records purge error:', vrErr.message);
    }

    // 3. Cancel the upload_run
    const { error: runErr } = await admin
      .from('upload_runs')
      .update({ status: 'cancelled' })
      .eq('id', jobId);

    if (runErr) {
      return NextResponse.json(
        { error: 'Failed to cancel upload run', detail: runErr.message },
        { status: 500 },
      );
    }

    // 4. Update batch_log: mark killed, record who terminated and at which stage
    const { data: batchLog, error: batchErr } = await admin
      .from('batch_logs')
      .update({
        phase:             'killed',
        done_at:           now,
        terminated_by:     auth.uid,
        terminated_stage:  stage,
      })
      .eq('run_id', jobId)
      .select('batch_id')
      .single();

    if (batchErr) {
      // batch_log missing is non-fatal — run was already cancelled
      console.error('batch_log update error:', batchErr.message);
    }

    return NextResponse.json({
      terminated:    true,
      runId:         jobId,
      batchId:       batchLog?.batch_id ?? null,
      stage,
      terminatedBy:  auth.uid,
      terminatedAt:  now,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('pipeline terminate unhandled:', msg);
    return NextResponse.json({ error: 'Unexpected server error', detail: msg }, { status: 500 });
  }
}
