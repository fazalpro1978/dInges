import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

const pub = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(
  _req: NextRequest,
  { params }: { params: { runId: string } },
) {
  const { runId } = params;

  // Also try the corrected UUID (last char 9 instead of 3, common font confusion)
  const correctedId = runId.endsWith('3')
    ? runId.slice(0, -1) + '9'
    : runId.endsWith('9')
    ? runId.slice(0, -1) + '3'
    : runId;

  const [
    { data: batchByRunId, error: batchErr },
    { data: batchByCorrected, error: batchCorrectedErr },
    { data: vettedByRunId, error: vettedErr },
    { data: vettedByCorrected },
    { data: uploadRunCols, error: uploadColErr },
    { data: uploadById, error: uploadByIdErr },
  ] = await Promise.all([
    admin.from('batch_logs').select('batch_id, run_id, phase, done_at').eq('run_id', runId).limit(3),
    admin.from('batch_logs').select('batch_id, run_id, phase, done_at').eq('run_id', correctedId).limit(3),
    admin.from('vetted_records').select('id, acknowledged_at').eq('run_id', runId).limit(5),
    admin.from('vetted_records').select('id, acknowledged_at').eq('run_id', correctedId).limit(5),
    // Check what columns upload_runs actually has
    admin.from('upload_runs').select('*').limit(1),
    admin.from('upload_runs').select('*').eq('id', runId).maybeSingle(),
  ]);

  // Simulate the status route logic for the queried runId
  const batchPhase = batchByRunId?.[0]?.phase ?? batchByCorrected?.[0]?.phase ?? null;
  const effectiveRunId = batchByRunId?.length ? runId : correctedId;

  return NextResponse.json({
    queried_runId: runId,
    corrected_runId: correctedId,
    batch_for_queried:   { data: batchByRunId,   error: batchErr?.message },
    batch_for_corrected: { data: batchByCorrected, error: batchCorrectedErr?.message },
    vetted_for_queried:   { count: vettedByRunId?.length, sample: vettedByRunId, error: vettedErr?.message },
    vetted_for_corrected: { count: vettedByCorrected?.length, sample: vettedByCorrected },
    upload_runs_columns: uploadRunCols ? Object.keys(uploadRunCols) : null,
    upload_run_by_id: uploadById,
    upload_run_error: uploadByIdErr?.message,
    status_simulation: {
      batchPhase,
      effectiveRunId,
      wouldReturnAllAcknowledged: batchPhase === 'done',
    },
  });
}
