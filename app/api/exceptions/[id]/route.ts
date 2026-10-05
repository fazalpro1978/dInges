import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

/**
 * DELETE /api/exceptions/[id]
 * Rejects a single staged record — marks it rejected without writing to vetted_records.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as { notes?: string };
  const now = new Date().toISOString();
  const reviewer = auth.full_name ?? auth.uid;

  const { error } = await admin
    .from('staged_records')
    .update({
      status:         'rejected',
      reviewer_notes: body.notes ?? 'Rejected via Exception Queue',
      reviewed_at:    now,
      reviewed_by:    reviewer,
    })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
