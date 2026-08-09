import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const { runId, batchId } = (await req.json()) as { runId?: string; batchId?: string };
    if (!runId && !batchId) return NextResponse.json({ error: 'runId or batchId required' }, { status: 400 });

    const now = new Date().toISOString();

    // batch_id is the canonical unique key for batch_logs — always use it.
    // run_id is only used to also cancel the upload_runs row when available.
    const { data: updated, error: batchErr } = await admin
      .from('batch_logs')
      .update({ phase: 'killed', done_at: now })
      .eq('batch_id', batchId!)
      .select('batch_id');

    if (batchErr) throw new Error(batchErr.message);
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: `No batch_log found for batch_id ${batchId}` }, { status: 404 });
    }

    if (runId) {
      await admin.from('upload_runs').update({ status: 'cancelled' }).eq('id', runId);
    }

    return NextResponse.json({ cancelled: true, runId: runId ?? null, batchId: batchId ?? null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kill failed' },
      { status: 500 },
    );
  }
}
