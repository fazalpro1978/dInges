import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { requireAuth } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

function fmtDate(s: string | null) {
  if (!s) return '';
  return new Date(s).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const format     = searchParams.get('format')      ?? 'csv';
  const search     = searchParams.get('search')      ?? '';
  const phase      = searchParams.get('phase')       ?? '';
  const from       = searchParams.get('from')        ?? '';
  const to         = searchParams.get('to')          ?? '';
  const uploadedBy = searchParams.get('uploaded_by') ?? '';

  let q = admin
    .from('batch_logs')
    .select('batch_id, file_name, uploaded_by, phase, record_count_total, record_count_success, record_count_failed, error_summary_payload, uploaded_at, done_at')
    .order('uploaded_at', { ascending: false })
    .limit(5000);

  if (search)     q = q.ilike('file_name', `%${search}%`);
  if (phase)      q = q.eq('phase', phase);
  if (from)       q = q.gte('uploaded_at', from);
  if (to)         q = q.lte('uploaded_at', `${to}T23:59:59`);
  if (uploadedBy) q = q.ilike('uploaded_by', `%${uploadedBy}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map(r => ({
    'Batch ID':     r.batch_id,
    'File Name':    r.file_name,
    'Uploaded By':  r.uploaded_by ?? '',
    'Phase':        r.phase,
    'Total':        r.record_count_total,
    'Success':      r.record_count_success,
    'Failed':       r.record_count_failed,
    'Error Count':  (r.error_summary_payload as unknown[])?.length ?? 0,
    'Uploaded At':  fmtDate(r.uploaded_at),
    'Done At':      fmtDate(r.done_at),
  }));

  if (format === 'xlsx') {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Batch Logs');
    const buf = Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="batch-logs-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  }

  // CSV
  const headers = Object.keys(rows[0] ?? {});
  const escape  = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv     = [
    headers.map(escape).join(','),
    ...rows.map(r => headers.map(h => escape((r as Record<string, unknown>)[h])).join(',')),
  ].join('\r\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="batch-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
