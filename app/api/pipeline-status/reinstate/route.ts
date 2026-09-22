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
    const { runId } = (await req.json()) as { runId: string };
    if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 });

    const now = new Date().toISOString();

    // Fetch staged records that are still pending (not yet approved/rejected)
    const [stagedRes, runRes] = await Promise.all([
      admin.from('staged_records')
        .select('id, resolved_data, match_type')
        .eq('run_id', runId)
        .eq('status', 'pending'),
      admin.from('upload_runs')
        .select('source_file')
        .eq('id', runId)
        .single(),
    ]);

    const staged = stagedRes.data ?? [];
    if (staged.length === 0) {
      return NextResponse.json({ error: 'No pending staged records found — records may have already been processed.' }, { status: 404 });
    }

    // Guard: skip any already in vetted_records
    const { data: existing } = await admin
      .from('vetted_records')
      .select('staged_id')
      .eq('run_id', runId);
    const alreadyVetted = new Set((existing ?? []).map((v: { staged_id: string }) => v.staged_id));
    const toVet = staged.filter(s => !alreadyVetted.has(s.id));

    if (toVet.length === 0) {
      return NextResponse.json({ message: 'All records are already in the REIMS queue.', reinstated: 0 });
    }

    // Auto-approve: insert into vetted_records
    const inserts = toVet.map(s => ({
      staged_id:   s.id,
      run_id:      runId,
      payload:     s.resolved_data,
      source_file: runRes.data?.source_file ?? null,
      match_type:  s.match_type,
      approved_by: 'Administrator (Reinstated)',
    }));

    const { error: vettedErr } = await admin.from('vetted_records').insert(inserts);
    if (vettedErr) return NextResponse.json({ error: vettedErr.message }, { status: 500 });

    // Mark staged records as approved
    await admin.from('staged_records')
      .update({ status: 'approved', reviewed_at: now, reviewed_by: 'Administrator (Reinstated)' })
      .eq('run_id', runId)
      .in('id', toVet.map(s => s.id));

    // Advance upload_runs + batch_logs
    await Promise.all([
      admin.from('upload_runs')
        .update({ status: 'approved', approved_count: toVet.length })
        .eq('id', runId),
      admin.from('batch_logs')
        .update({ phase: 'review_approve', review_approve_at: now, record_count_success: toVet.length })
        .eq('run_id', runId),
    ]);

    return NextResponse.json({ reinstated: toVet.length, runId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Reinstate failed' }, { status: 500 });
  }
}
