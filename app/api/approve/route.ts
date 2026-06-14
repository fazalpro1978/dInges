import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    for (const a of approvals) {
      // Update staged_records status
      const { error: updateErr } = await admin
        .from('staged_records')
        .update({
          status:        a.decision,
          reviewer_notes: a.notes ?? null,
          reviewed_at:   now,
          reviewed_by:   reviewer,
          ...(a.resolvedData ? { resolved_data: a.resolvedData } : {}),
        })
        .eq('id', a.stagedId);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      if (a.decision === 'approved') {
        // Fetch the staged record to get resolved_data and match_type
        const { data: staged, error: fetchErr } = await admin
          .from('staged_records')
          .select('resolved_data, match_type, run_id')
          .eq('id', a.stagedId)
          .single();

        if (fetchErr || !staged) {
          return NextResponse.json({ error: `Staged record ${a.stagedId} not found` }, { status: 404 });
        }

        // Fetch source file from the run
        const { data: run } = await admin
          .from('upload_runs')
          .select('source_file')
          .eq('id', runId)
          .single();

        const payload = a.resolvedData ?? (staged.resolved_data as Record<string, unknown>);

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
      } else {
        rejectedCount++;
      }
    }

    // Update run counters and status
    const { data: run } = await admin
      .from('upload_runs')
      .select('record_count')
      .eq('id', runId)
      .single();

    const total = run?.record_count ?? approvals.length;
    const newStatus =
      approvedCount === 0 ? 'staged'
      : approvedCount === total ? 'approved'
      : 'partially_approved';

    await admin
      .from('upload_runs')
      .update({ approved_count: approvedCount, status: newStatus })
      .eq('id', runId);

    return NextResponse.json({ runId, approved: approvedCount, rejected: rejectedCount });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Approve failed' }, { status: 500 });
  }
}
