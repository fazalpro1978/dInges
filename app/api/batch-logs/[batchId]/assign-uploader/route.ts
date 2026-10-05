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
    const { uploaded_by } = await req.json() as { uploaded_by: string };

    if (!uploaded_by?.trim()) {
      return NextResponse.json({ error: 'uploaded_by is required' }, { status: 400 });
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
      return NextResponse.json({ error: 'Only completed batches (done/killed) can be reassigned' }, { status: 400 });
    }

    const { error } = await admin
      .from('batch_logs')
      .update({ uploaded_by: uploaded_by.trim() })
      .eq('batch_id', params.batchId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, uploaded_by: uploaded_by.trim() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Assignment failed' },
      { status: 500 },
    );
  }
}
