import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

function requireApiKey(req: NextRequest): boolean {
  return req.headers.get('x-api-key') === process.env.INGEST_API_KEY;
}

export async function POST(req: NextRequest) {
  if (!requireApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { ids } = (await req.json()) as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids[] required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from('vetted_records')
      .update({ acknowledged_at: now })
      .in('id', ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Update run exported_count for affected runs
    const { data: records } = await admin
      .from('vetted_records')
      .select('run_id')
      .in('id', ids);

    if (records) {
      const runIds = Array.from(new Set(records.map((r: { run_id: string }) => r.run_id).filter(Boolean)));
      const doneAt = new Date().toISOString();
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
        // Mark batch log as done
        await admin
          .from('batch_logs')
          .update({ phase: 'done', done_at: doneAt })
          .eq('run_id', rid);
      }
    }

    return NextResponse.json({ acknowledged: ids.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Acknowledge failed' }, { status: 500 });
  }
}
