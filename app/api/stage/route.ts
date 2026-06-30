import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

interface MatchResult {
  rowIndex: number;
  unitId: string | null;
  matchType: string;
  matchConfidence: number;
  rawData: Record<string, unknown>;
  resolvedData: Record<string, unknown>;
  action: string;
  conflictFields: Record<string, unknown> | null;
  existingSnapshot: Record<string, unknown> | null;
}

export async function POST(req: NextRequest) {
  try {
    const { fileName, fileSize, results, uploadedBy, totalRecords, errorSummary } = (await req.json()) as {
      fileName: string;
      fileSize?: number;
      results: MatchResult[];
      uploadedBy?: string;
      totalRecords?: number;
      errorSummary?: { row: number; field: string; value: unknown; error: string }[];
    };

    if (!fileName || !Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ error: 'fileName and results[] required' }, { status: 400 });
    }

    const fileHash = createHash('sha256').update(fileName + Date.now()).digest('hex').slice(0, 16);

    // Create the upload run
    const { data: run, error: runErr } = await admin
      .from('upload_runs')
      .insert({
        source_file:   fileName,
        file_hash:     fileHash,
        file_size:     fileSize ?? null,
        status:        'staged',
        record_count:  results.length,
        uploaded_by:   uploadedBy ?? 'Administrator',
      })
      .select('id')
      .single();

    if (runErr || !run) {
      return NextResponse.json({ error: runErr?.message ?? 'Failed to create run' }, { status: 500 });
    }

    // Insert staged records
    const rows = results.map((r) => ({
      run_id:           run.id,
      row_index:        r.rowIndex,
      raw_data:         r.rawData,
      resolved_data:    r.resolvedData,
      match_type:       r.action,
      match_confidence: r.matchConfidence,
      conflict_fields:  r.conflictFields ?? null,
      status:           'pending',
    }));

    const { error: stageErr } = await admin.from('staged_records').insert(rows);
    if (stageErr) {
      return NextResponse.json({ error: stageErr.message }, { status: 500 });
    }

    // Create batch audit log entry
    const total   = totalRecords ?? results.length;
    const failed  = Math.max(0, total - results.length);
    const { data: batchLog, error: batchErr } = await admin
      .from('batch_logs')
      .insert({
        run_id:               run.id,
        file_name:            fileName,
        uploaded_by:          uploadedBy ?? 'Administrator',
        phase:                'uploaded',
        record_count_total:   total,
        record_count_success: results.length,
        record_count_failed:  failed,
        error_summary_payload: errorSummary ?? [],
      })
      .select('batch_id')
      .single();

    if (batchErr) console.error('[stage] batch_log insert failed:', batchErr.message);

    return NextResponse.json({ runId: run.id, staged: results.length, batchId: batchLog?.batch_id ?? null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Stage failed' }, { status: 500 });
  }
}
