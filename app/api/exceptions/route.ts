import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

export async function GET(_req: NextRequest) {
  // Fetch records that are low-confidence fuzzy matches OR blocked by schema errors
  const { data: records, error } = await admin
    .from('staged_records')
    .select('id, run_id, row_index, resolved_data, match_type, match_confidence, status, reviewer_notes, created_at')
    .or('match_confidence.lt.0.85,status.eq.schema_error')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!records || records.length === 0) {
    return NextResponse.json({ exceptions: [], total: 0 });
  }

  // Batch-fetch run details
  const runIds = Array.from(new Set(records.map(r => r.run_id as string)));
  const { data: runs } = await admin
    .from('upload_runs')
    .select('id, source_file, uploaded_by, created_at')
    .in('id', runIds);

  const runMap = Object.fromEntries((runs ?? []).map(r => [r.id, r]));

  const exceptions = records.map(r => {
    const run = runMap[r.run_id as string] ?? null;
    const rd = r.resolved_data as Record<string, unknown> | null;
    return {
      id:             r.id,
      run_id:         r.run_id,
      row_index:      r.row_index,
      status:         r.status,
      match_type:     r.match_type,
      match_confidence: r.match_confidence,
      reviewer_notes: r.reviewer_notes,
      created_at:     r.created_at,
      property:       rd?.property ?? null,
      unit_no:        rd?.unit_no ?? null,
      type:           rd?.type ?? null,
      // Exception classification
      exception_type:
        r.status === 'schema_error'   ? 'Schema Error'
        : r.match_confidence < 0.85  ? `Low Confidence (${Math.round((r.match_confidence as number) * 100)}%)`
        : 'Flagged',
      run: run ? { source_file: run.source_file, uploaded_by: run.uploaded_by, created_at: run.created_at } : null,
    };
  });

  return NextResponse.json({ exceptions, total: exceptions.length });
}
