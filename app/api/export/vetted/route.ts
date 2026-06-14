import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

function requireApiKey(req: NextRequest): boolean {
  const key = req.headers.get('x-api-key');
  return key === process.env.INGEST_API_KEY;
}

export async function GET(req: NextRequest) {
  if (!requireApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl;
  const runId    = url.searchParams.get('runId');
  const limit    = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 500);
  const offset   = parseInt(url.searchParams.get('offset') ?? '0');

  let query = admin
    .from('vetted_records')
    .select('id, staged_id, run_id, payload, source_file, match_type, approved_at, approved_by')
    .is('exported_at', null)         // only un-exported records
    .is('acknowledged_at', null)
    .order('approved_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (runId) query = query.eq('run_id', runId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mark as exported
  if (data && data.length > 0) {
    const ids = data.map((r: { id: string }) => r.id);
    await admin
      .from('vetted_records')
      .update({ exported_at: new Date().toISOString() })
      .in('id', ids);
  }

  return NextResponse.json({ records: data ?? [], count: data?.length ?? 0 });
}
