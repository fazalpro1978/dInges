import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateCanonical, schemaErrorSummary, type SchemaError } from '@/lib/validateCanonical';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

export async function POST(req: NextRequest) {
  try {
    const { runId, approvals, reviewedBy } = (await req.json()) as {
      runId: string;
      approvals: {
        stagedId: string;
        decision: 'approved' | 'rejected';
        resolvedData?: Record<string, unknown>;
        notes?: string;
      }[];
      reviewedBy?: string;
    };

    if (!runId || !Array.isArray(approvals) || approvals.length === 0) {
      return NextResponse.json({ error: 'runId and approvals[] required' }, { status: 400 });
    }

    const reviewer = reviewedBy ?? 'Administrator';
    const now = new Date().toISOString();

    let approvedCount = 0;
    let rejectedCount = 0;
    const schemaErrors: { stagedId: string; rowIndex?: number; errors: SchemaError[] }[] = [];

    // Fetch source file once for the whole run
    const { data: run } = await admin
      .from('upload_runs')
      .select('source_file, record_count')
      .eq('id', runId)
      .single();

    for (const a of approvals) {
      // Rejections — fast path, no validation needed
      if (a.decision === 'rejected') {
        await admin
          .from('staged_records')
          .update({ status: 'rejected', reviewer_notes: a.notes ?? null, reviewed_at: now, reviewed_by: reviewer })
          .eq('id', a.stagedId);
        rejectedCount++;
        continue;
      }

      // Approved — fetch staged record first so we can validate
      const { data: staged, error: fetchErr } = await admin
        .from('staged_records')
        .select('resolved_data, match_type, row_index, run_id')
        .eq('id', a.stagedId)
        .single();

      if (fetchErr || !staged) {
        return NextResponse.json({ error: `Staged record ${a.stagedId} not found` }, { status: 404 });
      }

      const payload = a.resolvedData ?? (staged.resolved_data as Record<string, unknown>);
      const { valid, errors } = validateCanonical(payload);

      if (!valid) {
        // Block from reaching vetted_records.
        // DB check constraint only allows 'rejected' — we prefix reviewer_notes
        // with [SCHEMA ERROR] so the exception queue can distinguish from manual rejects.
        await admin
          .from('staged_records')
          .update({
            status:         'rejected',
            reviewer_notes: `[SCHEMA ERROR] ${schemaErrorSummary(errors)}`,
            reviewed_at:    now,
            reviewed_by:    reviewer,
            ...(a.resolvedData ? { resolved_data: a.resolvedData } : {}),
          })
          .eq('id', a.stagedId);

        schemaErrors.push({ stagedId: a.stagedId, rowIndex: staged.row_index, errors });
        rejectedCount++;
        continue;
      }

      // Valid — update staged_records then write to vetted_records
      await admin
        .from('staged_records')
        .update({
          status:         'approved',
          reviewer_notes: a.notes ?? null,
          reviewed_at:    now,
          reviewed_by:    reviewer,
          ...(a.resolvedData ? { resolved_data: a.resolvedData } : {}),
        })
        .eq('id', a.stagedId);

      const { error: vettedErr } = await admin.from('vetted_records').insert({
        staged_id:   a.stagedId,
        run_id:      runId,
        payload,
        source_file: run?.source_file ?? null,
        match_type:  staged.match_type,
        approved_by: reviewer,
      });

      if (vettedErr) {
        return NextResponse.json({ error: vettedErr.message }, { status: 500 });
      }
      approvedCount++;
    }

    // Update run counters
    const total = run?.record_count ?? approvals.length;
    const newStatus =
      approvedCount === 0 ? 'staged'
      : approvedCount === total ? 'approved'
      : 'partially_approved';

    await admin
      .from('upload_runs')
      .update({ approved_count: approvedCount, status: newStatus })
      .eq('id', runId);

    // Advance batch audit log
    await admin
      .from('batch_logs')
      .update({
        phase:                'review_approve',
        review_approve_at:    now,
        record_count_success: approvedCount,
        record_count_failed:  rejectedCount,
      })
      .eq('run_id', runId);

    return NextResponse.json({
      runId,
      approved:     approvedCount,
      rejected:     rejectedCount,
      schemaErrors: schemaErrors.length > 0 ? schemaErrors : undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Approve failed' }, { status: 500 });
  }
}
