import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateCanonical, schemaErrorSummary } from '@/lib/validateCanonical';
import { requireAuth } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

function normalisePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const p = { ...raw };

  if (typeof p.furnishing === 'string') {
    const f = p.furnishing.trim().toUpperCase().replace(/\s+/g, ' ');
    if (['FURNISHED', 'FF', 'FULL FURNISHED', 'FULLY-FURNISHED', 'FULLY FURNISHED'].includes(f))
      p.furnishing = 'Fully Furnished';
    else if (['SEMI FURNISHED', 'SEMI-FURNISHED', 'SF', 'SEMIFURNISHED'].includes(f) || f.startsWith('SEMI'))
      p.furnishing = 'Semi-Furnished';
    else if (['UF', 'UNFURNISHED', 'UN-FURNISHED'].includes(f))
      p.furnishing = 'Unfurnished';
  }

  if (typeof p.kitchen === 'string') {
    const k = p.kitchen.trim().toUpperCase();
    if (k === 'CLOSE') p.kitchen = 'Closed';
    else if (k === 'OPEN') p.kitchen = 'Open';
    else if (k === 'PANTRY') p.kitchen = 'Pantry';
  }

  if (typeof p.type === 'string') {
    const t = p.type.trim().toUpperCase().replace(/\s+/g, ' ');
    if (['RESIDENTIAL', 'RESIDIENTIAL', 'COMMERCIAL', 'INDUSTRIAL'].includes(t)) p.type = null;
    if (['FLAT', 'APT', 'APT.', 'APARTMENT'].includes(t)) p.type = 'Apartment';
    if (t === 'STUDIO') p.type = 'Studio';
    if (t === 'VILLA' || t === 'VIL') p.type = 'Villa';
    if (t === 'OFFICE' || t.endsWith('OFFICE') || t === 'OFFICES') p.type = 'Office';
    if (t === 'SHOP') p.type = 'Shop';
  }

  return p;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { notes, resolvedData } = await req.json().catch(() => ({})) as {
    notes?: string;
    resolvedData?: Record<string, unknown>;
  };

  const now = new Date().toISOString();
  const reviewer = auth.full_name ?? auth.uid;

  // Fetch staged record
  const { data: staged, error: fetchErr } = await admin
    .from('staged_records')
    .select('id, resolved_data, match_type, run_id, delta_status, row_index, status, reviewer_notes')
    .eq('id', params.id)
    .single();

  if (fetchErr || !staged) {
    return NextResponse.json({ error: 'Staged record not found' }, { status: 404 });
  }

  // Only act on records that are still pending / schema_error
  const stagedStatus = staged.status as string;
  const stagedNotes = staged.reviewer_notes as string | null;
  if (!['pending', 'schema_error'].includes(stagedStatus) && !stagedNotes?.startsWith('[SCHEMA ERROR]')) {
    return NextResponse.json({ error: 'Record is not pending review' }, { status: 409 });
  }

  // Fetch source file from upload_run
  const { data: run } = await admin
    .from('upload_runs')
    .select('source_file')
    .eq('id', staged.run_id as string)
    .single();

  const rawPayload = resolvedData ?? (staged.resolved_data as Record<string, unknown>);
  const payload = normalisePayload(rawPayload);

  const { valid, errors } = validateCanonical(payload);

  if (!valid) {
    await admin
      .from('staged_records')
      .update({
        status:         'rejected',
        reviewer_notes: `[SCHEMA ERROR] ${schemaErrorSummary(errors)}`,
        reviewed_at:    now,
        reviewed_by:    reviewer,
        ...(resolvedData ? { resolved_data: resolvedData } : {}),
      })
      .eq('id', params.id);

    return NextResponse.json({
      ok: false,
      schemaErrors: errors,
      message: `Validation failed: ${schemaErrorSummary(errors)}`,
    }, { status: 422 });
  }

  // Mark staged record approved
  await admin
    .from('staged_records')
    .update({
      status:         'approved',
      reviewer_notes: notes ?? null,
      reviewed_at:    now,
      reviewed_by:    reviewer,
      ...(resolvedData ? { resolved_data: resolvedData } : {}),
    })
    .eq('id', params.id);

  const effectiveMatchType = (payload as Record<string, unknown>).__patch_only
    ? 'backfill'
    : staged.match_type as string;

  const deltaStatus = (staged.delta_status as string | null) ??
    (staged.match_type === 'new' ? 'ST_NEW' : 'ST_UPDATED');

  const { error: vettedErr } = await admin.from('vetted_records').insert({
    staged_id:    params.id,
    run_id:       staged.run_id,
    payload,
    source_file:  run?.source_file ?? null,
    match_type:   effectiveMatchType,
    delta_status: deltaStatus,
    approved_by:  reviewer,
  });

  if (vettedErr) {
    return NextResponse.json({ error: vettedErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, delta_status: deltaStatus });
}
