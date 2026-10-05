import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

export async function GET(_req: NextRequest) {
  // Low-confidence = fuzzy matches (confidence 0.01–0.84, match_type != 'new').
  // New records have confidence=0 by design — not an exception.
  // schema_error records are always included regardless of confidence.
  const { data: records, error } = await admin
    .from('staged_records')
    .select('id, run_id, row_index, resolved_data, match_type, match_confidence, status, reviewer_notes, staged_at, delta_status')
    .or('and(match_confidence.lt.0.85,match_confidence.gt.0),reviewer_notes.like.[SCHEMA ERROR]%')
    .order('staged_at', { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!records || records.length === 0) {
    return NextResponse.json({ exceptions: [], total: 0 });
  }

  // Batch-fetch run details + batch log traceability in parallel
  const runIds = Array.from(new Set(records.map(r => r.run_id as string)));
  const [{ data: runs }, { data: batchLogs }] = await Promise.all([
    admin.from('upload_runs').select('id, source_file, uploaded_by, staged_at').in('id', runIds),
    admin.from('batch_logs').select('run_id, batch_id, file_name, uploaded_at').in('run_id', runIds),
  ]);

  const runMap      = Object.fromEntries((runs      ?? []).map(r => [r.id,      r]));
  const batchLogMap = Object.fromEntries((batchLogs ?? []).map(b => [b.run_id,  b]));

  const exceptions = records.map(r => {
    const run = runMap[r.run_id as string]      ?? null;
    const bl  = batchLogMap[r.run_id as string] ?? null;
    const rd  = r.resolved_data as Record<string, unknown> | null;
    return {
      id:               r.id,
      run_id:           r.run_id,
      row_index:        r.row_index,
      status:           r.status,
      match_type:       r.match_type,
      match_confidence: r.match_confidence,
      reviewer_notes:   r.reviewer_notes,
      staged_at:        r.staged_at,
      property:         rd?.property ?? null,
      unit_no:          rd?.unit_no  ?? null,
      type:             rd?.type     ?? null,
      resolved_data:    rd,
      delta_status:     r.delta_status,
      // Batch traceability
      batch_id:         bl?.batch_id    ?? null,
      file_name:        bl?.file_name   ?? run?.source_file ?? null,
      uploaded_at:      bl?.uploaded_at ?? null,
      // Exception classification
      exception_type:
        String(r.reviewer_notes ?? '').startsWith('[SCHEMA ERROR]') ? 'Schema Error'
        : r.match_confidence > 0 && (r.match_confidence as number) < 0.85 ? `Low Confidence (${Math.round((r.match_confidence as number) * 100)}%)`
        : 'Flagged',
      run: run ? { source_file: run.source_file, uploaded_by: run.uploaded_by, staged_at: run.staged_at } : null,
    };
  });

  return NextResponse.json({ exceptions, total: exceptions.length });
}

/**
 * DELETE /api/exceptions
 * Body: { scope: 'schema_errors' | 'low_confidence' | 'all' }
 * Permanently deletes matching staged_records (and orphaned upload_runs).
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { scope } = (await req.json()) as { scope: 'schema_errors' | 'low_confidence' | 'all' };
  if (!['schema_errors', 'low_confidence', 'all'].includes(scope)) {
    return NextResponse.json({ error: 'scope must be schema_errors | low_confidence | all' }, { status: 400 });
  }

  // Build filter matching the same records the GET returns
  let filter = '';
  if (scope === 'schema_errors') {
    filter = `reviewer_notes.like.[SCHEMA ERROR]%`;
  } else if (scope === 'low_confidence') {
    filter = `and(match_confidence.lt.0.85,match_confidence.gt.0)`;
  } else {
    // all — schema errors OR low confidence
    filter = `or(reviewer_notes.like.[SCHEMA ERROR]%,and(match_confidence.lt.0.85,match_confidence.gt.0))`;
  }

  const { data: toDelete, error: fetchErr } = await admin
    .from('staged_records')
    .select('id, run_id')
    .or(
      scope === 'schema_errors'
        ? 'reviewer_notes.like.[SCHEMA ERROR]%'
        : scope === 'low_confidence'
          ? 'match_confidence.lt.0.85,match_confidence.gt.0'
          : 'reviewer_notes.like.[SCHEMA ERROR]%,match_confidence.lt.0.85',
    );

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!toDelete || toDelete.length === 0) return NextResponse.json({ deleted: 0 });

  const ids    = toDelete.map(r => r.id as string);
  const runIds = Array.from(new Set(toDelete.map(r => r.run_id as string)));

  // Delete staged_records
  const { error: delErr } = await admin.from('staged_records').delete().in('id', ids);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // Delete upload_runs that now have no staged_records left
  const { data: remaining } = await admin
    .from('staged_records')
    .select('run_id')
    .in('run_id', runIds);

  const runIdsWithRecords = new Set((remaining ?? []).map(r => r.run_id as string));
  const orphanRunIds = runIds.filter(id => !runIdsWithRecords.has(id));

  if (orphanRunIds.length > 0) {
    await admin.from('upload_runs').delete().in('id', orphanRunIds);
  }

  return NextResponse.json({ deleted: ids.length, runsRemoved: orphanRunIds.length });
}
