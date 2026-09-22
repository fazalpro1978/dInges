import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

function requireApiKey(req: NextRequest): boolean {
  const key = req.headers.get('x-api-key');
  return key === process.env.INGEST_API_KEY;
}

// Force-acknowledges ALL unacknowledged vetted records — admin escape hatch.
// Used when REIMS shows "Queue is clear" but records are known to exist.
export async function POST(req: NextRequest) {
  if (!requireApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();

  // Fetch unacknowledged IDs first so we can return the count and update run state
  const { data: pending, error: fetchErr } = await admin
    .from('vetted_records')
    .select('id, run_id')
    .is('acknowledged_at', null);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  if (!pending || pending.length === 0) {
    return NextResponse.json({ cleared: 0 });
  }

  const ids = pending.map((r: { id: string }) => r.id);

  const { error: updateErr } = await admin
    .from('vetted_records')
    .update({ exported_at: now, acknowledged_at: now })
    .in('id', ids);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Update run status for all affected runs
  const runIds = Array.from(new Set(pending.map((r: { run_id: string }) => r.run_id).filter(Boolean)));
  for (const rid of runIds) {
    const { count } = await admin
      .from('vetted_records')
      .select('id', { count: 'exact', head: true })
      .eq('run_id', rid)
      .not('acknowledged_at', 'is', null);
    await admin
      .from('upload_runs')
      .update({ exported_count: count ?? 0, status: 'exported' })
      .eq('id', rid);
    await admin
      .from('batch_logs')
      .update({ phase: 'done', done_at: now })
      .eq('run_id', rid);
  }

  return NextResponse.json({ cleared: ids.length });
}
