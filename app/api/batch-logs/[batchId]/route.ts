import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { batchId: string } },
) {
  try {
    const body = await req.json() as {
      phase?: string;
      record_count_success?: number;
      record_count_failed?: number;
      record_count_total?: number;
      error_summary_payload?: unknown[];
    };

    const now = new Date().toISOString();
    const update: Record<string, unknown> = { updated_at: now };

    if (body.phase) {
      update.phase = body.phase;
      if (body.phase === 'review_approve') update.review_approve_at = now;
      if (body.phase === 'done')           update.done_at = now;
    }
    if (body.record_count_success  != null) update.record_count_success  = body.record_count_success;
    if (body.record_count_failed   != null) update.record_count_failed   = body.record_count_failed;
    if (body.record_count_total    != null) update.record_count_total    = body.record_count_total;
    if (body.error_summary_payload != null) update.error_summary_payload = body.error_summary_payload;

    const { error } = await admin
      .from('batch_logs')
      .update(update)
      .eq('batch_id', params.batchId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Patch failed' }, { status: 500 });
  }
}
