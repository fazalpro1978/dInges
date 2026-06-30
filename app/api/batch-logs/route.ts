import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

export async function GET(req: NextRequest) {
  const p        = req.nextUrl.searchParams;
  const phase    = p.get('phase') ?? '';
  const from     = p.get('from') ?? '';
  const to       = p.get('to') ?? '';
  const search   = p.get('search') ?? '';
  const limit    = Math.min(parseInt(p.get('limit') ?? '50'), 200);
  const offset   = parseInt(p.get('offset') ?? '0');

  let q = admin
    .from('batch_logs')
    .select('*, upload_runs!batch_logs_run_id_fkey(status, approved_count, exported_count)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (phase)  q = q.eq('phase', phase);
  if (from)   q = q.gte('created_at', from);
  if (to)     q = q.lte('created_at', to + 'T23:59:59Z');
  if (search) q = q.ilike('file_name', `%${search}%`);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data ?? [], total: count ?? 0 });
}
