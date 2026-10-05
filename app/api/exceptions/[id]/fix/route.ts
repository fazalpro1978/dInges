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
 * PATCH /api/exceptions/[id]/fix
 * Merges corrected field values into resolved_data, then forwards to /approve.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { fields, notes } = await req.json() as {
    fields: Record<string, unknown>;
    notes?: string;
  };

  if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'fields required' }, { status: 400 });
  }

  // Fetch current resolved_data
  const { data: staged, error: fetchErr } = await admin
    .from('staged_records')
    .select('resolved_data')
    .eq('id', params.id)
    .single();

  if (fetchErr || !staged) {
    return NextResponse.json({ error: 'Staged record not found' }, { status: 404 });
  }

  const merged = {
    ...(staged.resolved_data as Record<string, unknown> ?? {}),
    ...fields,
  };

  // Forward to approve with merged data — rebuild the request body
  const approveUrl = new URL(req.url);
  approveUrl.pathname = approveUrl.pathname.replace('/fix', '/approve');

  const approveReq = new NextRequest(approveUrl, {
    method: 'PATCH',
    headers: req.headers,
    body: JSON.stringify({ resolvedData: merged, notes }),
  });

  // Import and call approve handler directly to avoid HTTP round-trip
  const { PATCH: approvePatch } = await import('../approve/route');
  return approvePatch(approveReq, { params: { id: params.id } });
}
