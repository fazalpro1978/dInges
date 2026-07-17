import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    .select('id, run_id, row_index, resolved_data, match_type, match_confidence, status, reviewer_notes, staged_at')
    .or('and(match_confidence.lt.0.85,match_confidence.gt.0),reviewer_notes.like.[SCHEMA ERROR]%')
    .order('staged_at', { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!records || records.length === 0) {
    return NextResponse.json({ exceptions: [], total: 0 });
  }

  // Batch-fetch run details
  const runIds = Array.from(new Set(records.map(r => r.run_id as string)));
  const { data: runs } = await admin
    .from('upload_runs')
    .select('id, source_file, uploaded_by, staged_at')
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
      staged_at:     r.staged_at,
      property:       rd?.property ?? null,
      unit_no:        rd?.unit_no ?? null,
      type:           rd?.type ?? null,
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
