import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/serverAuth';
import { registry } from '@/lib/registryClient';

// Audit Trail Log — reads cr_code_overrides for the Stage 2 audit panel.
// Superuser-only feature for pattern promotion (reason_code count >= 3).
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const params      = req.nextUrl.searchParams;
  const reasonCode  = params.get('reason_code');
  const from        = params.get('from');
  const to          = params.get('to');
  const smartCode   = params.get('smart_code');
  const page        = Math.max(1, Number(params.get('page') ?? '1'));
  const limit       = 50;

  let query = registry
    .from('cr_code_overrides')
    .select(
      'id, created_at, smart_code, field_changed, reason_code, reason_text, value_before, value_after, override_by, registry_id, cr_registry!inner(building_name, floor_ref, unit_ref, status)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (reasonCode) query = query.eq('reason_code', reasonCode);
  if (from)       query = query.gte('created_at', from);
  if (to)         query = query.lte('created_at', to + 'T23:59:59Z');
  if (smartCode)  query = query.ilike('smart_code', `${smartCode}%`);

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For superusers: aggregate reason_code frequencies to surface promotable patterns
  const freq: Record<string, number> = {};
  if (auth.role === 'superuser' && data) {
    for (const row of data) freq[row.reason_code] = (freq[row.reason_code] ?? 0) + 1;
  }

  return NextResponse.json({
    overrides:          data ?? [],
    total:              count ?? 0,
    page,
    limit,
    promotablePatterns: auth.role === 'superuser'
      ? Object.entries(freq).filter(([, n]) => n >= 3).map(([reason_code, count]) => ({ reason_code, count }))
      : [],
  });
}
