import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

export async function POST(
  _req: NextRequest,
  { params }: { params: { runId: string } },
) {
  const { runId } = params;
  const now = new Date().toISOString();

  const [{ error: vErr }, { error: bErr }, { error: uErr }] = await Promise.all([
    admin.from('vetted_records').update({ acknowledged_at: now, exported_at: now }).eq('run_id', runId).is('acknowledged_at', null),
    admin.from('batch_logs').update({ phase: 'done', done_at: now }).eq('run_id', runId),
    admin.from('upload_runs').update({ status: 'exported' }).eq('id', runId),
  ]);

  if (vErr || bErr || uErr) {
    return NextResponse.json({ error: vErr?.message ?? bErr?.message ?? uErr?.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, runId });
}
