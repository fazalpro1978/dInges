import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

const ABANDONED_THRESHOLD_MS  = 2 * 60 * 60 * 1000; // 2 h — staged but never sent to REIMS
const STALLED_THRESHOLD_MS    = 6 * 60 * 60 * 1000; // 6 h — sent to REIMS but never acknowledged

export async function GET() {
  try {
    const now          = Date.now();
    const twoHoursAgo  = new Date(now - ABANDONED_THRESHOLD_MS).toISOString();
    const sixHoursAgo  = new Date(now - STALLED_THRESHOLD_MS).toISOString();

    const COLS = 'batch_id, run_id, file_name, uploaded_by, created_at, review_approve_at, record_count_total, record_count_success';

    const [abandonedRes, stalledRes, failedRes] = await Promise.all([
      // Abandoned: staged but session ended before proceeding to REIMS (> 2h old)
      admin.from('batch_logs')
        .select(COLS)
        .eq('phase', 'uploaded')
        .is('done_at', null)
        .lt('created_at', twoHoursAgo)
        .order('created_at', { ascending: false }),

      // Stalled: sent to REIMS queue but REIMS never acknowledged (> 6h)
      admin.from('batch_logs')
        .select(COLS)
        .eq('phase', 'review_approve')
        .is('done_at', null)
        .lt('review_approve_at', sixHoursAgo)
        .order('review_approve_at', { ascending: false }),

      // Failed: pipeline error
      admin.from('batch_logs')
        .select(COLS)
        .eq('phase', 'failed')
        .order('created_at', { ascending: false }),
    ]);

    return NextResponse.json(
      {
        abandoned: abandonedRes.data ?? [],
        stalled:   stalledRes.data  ?? [],
        failed:    failedRes.data   ?? [],
        checkedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Check failed' }, { status: 500 });
  }
}
