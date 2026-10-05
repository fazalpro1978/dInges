import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/serverAuth';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { batchId: string } },
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const { master_code, smart_code } = await req.json() as { master_code?: string; smart_code?: string };

    const mc = master_code?.trim() ?? '';
    const sc = smart_code?.trim() ?? '';

    if (mc && !/^\d{16}$/.test(mc)) {
      return NextResponse.json({ error: 'Master Code must be exactly 16 digits (numbers only)' }, { status: 400 });
    }
    if (sc && sc.length !== 14) {
      return NextResponse.json({ error: `Smart Code must be exactly 14 characters (got ${sc.length})` }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await admin
      .from('batch_logs')
      .select('phase')
      .eq('batch_id', params.batchId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    if (!['done', 'killed'].includes(existing.phase as string)) {
      return NextResponse.json({ error: 'Codes can only be assigned to completed (done/killed) batches' }, { status: 400 });
    }

    const { error } = await admin
      .from('batch_logs')
      .update({ master_code: mc || null, smart_code: sc || null })
      .eq('batch_id', params.batchId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, master_code: mc || null, smart_code: sc || null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Code assignment failed' },
      { status: 500 },
    );
  }
}
