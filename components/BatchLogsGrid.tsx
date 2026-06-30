'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

type ErrorEntry = { row: number; field: string; value: unknown; error: string };

type BatchLog = {
  batch_id:              string;
  run_id:                string | null;
  file_name:             string;
  uploaded_by:           string;
  phase:                 'uploaded' | 'review_approve' | 'done' | 'failed';
  record_count_total:    number;
  record_count_success:  number;
  record_count_failed:   number;
  error_summary_payload: ErrorEntry[];
  uploaded_at:           string;
  review_approve_at:     string | null;
  done_at:               string | null;
  created_at:            string;
  upload_runs?: {
    status:          string;
    approved_count:  number;
    exported_count:  number;
  } | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const PHASE_META: Record<string, { label: string; cls: string }> = {
  uploaded:       { label: 'Uploaded',        cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  review_approve: { label: 'Review & Approve', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  done:           { label: 'Done',             cls: 'bg-green-50 text-green-700 border-green-200' },
  failed:         { label: 'Failed',           cls: 'bg-red-50 text-red-700 border-red-200' },
};

function PhasePill({ phase }: { phase: string }) {
  const m = PHASE_META[phase] ?? { label: phase, cls: 'bg-gray-50 text-gray-600 border-gray-200' };
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${m.cls}`}>
      {m.label}
    </span>
  );
}

function shortId(id: string) { return id.slice(0, 8).toUpperCase(); }

function fmtDate(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ── Main component ────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function BatchLogsGrid() {
  const [logs, setLogs]             = useState<BatchLog[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [filterPhase, setFilterPhase] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo]     = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId]     = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (p: number, s: string, phase: string, from: string, to: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        limit:  String(PAGE_SIZE),
        offset: String((p - 1) * PAGE_SIZE),
        ...(s     && { search: s }),
        ...(phase && { phase }),
        ...(from  && { from }),
        ...(to    && { to }),
      });
      const res  = await fetch(`/api/batch-logs?${params}`, { cache: 'no-store' });
      const data = await res.json() as { logs: BatchLog[]; total: number; error?: string };
      if (!res.ok || data.error) { setError(data.error ?? 'Failed to load'); return; }
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(page, search, filterPhase, filterFrom, filterTo), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [load, page, search, filterPhase, filterFrom, filterTo]);

  function resetPage() { setPage(1); }

  async function copyId(id: string) {
    await navigator.clipboard.writeText(id).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Batch History</h1>
          <p className="text-xs text-gray-500">Administrative log of every ingestion batch across the full pipeline lifecycle</p>
        </div>
        <Link href="/" className="text-xs text-blue-600 hover:text-blue-800 underline font-medium">
          ← Back to Pipeline
        </Link>
      </header>

      <div className="max-w-[1700px] mx-auto px-6 py-6 space-y-4">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            placeholder="Search file name…"
            className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500"
          />
          <select
            value={filterPhase}
            onChange={(e) => { setFilterPhase(e.target.value); resetPage(); }}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="">All Phases</option>
            <option value="uploaded">Uploaded</option>
            <option value="review_approve">Review &amp; Approve</option>
            <option value="done">Done</option>
            <option value="failed">Failed</option>
          </select>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>From</span>
            <input type="date" value={filterFrom} onChange={(e) => { setFilterFrom(e.target.value); resetPage(); }}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>To</span>
            <input type="date" value={filterTo} onChange={(e) => { setFilterTo(e.target.value); resetPage(); }}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500" />
          </div>
          <button
            onClick={() => { setSearch(''); setFilterPhase(''); setFilterFrom(''); setFilterTo(''); resetPage(); }}
            className="text-xs text-gray-400 hover:text-gray-700 underline"
          >Clear</button>
          <span className="ml-auto text-[11px] text-gray-400">{total} batch{total !== 1 ? 'es' : ''}</span>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-500">Loading batch logs…</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-20 text-center text-xs text-gray-400">No batches match the current filters.</div>
          ) : (
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col style={{ width: '8%'  }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '7%'  }} />
                <col style={{ width: '7%'  }} />
                <col style={{ width: '7%'  }} />
                <col style={{ width: '6%'  }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['Batch ID', 'File Name', 'Uploaded By', 'Phase', 'Total', '✓ OK', '✗ Failed', 'Errors', 'Uploaded At', 'Done At'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const errCount  = log.error_summary_payload?.length ?? 0;
                  const isExpanded = expandedId === log.batch_id;
                  return (
                    <React.Fragment key={log.batch_id}>
                      <tr className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-blue-50/30' : ''}`}>
                        {/* Batch ID */}
                        <td className="px-3 py-2.5 overflow-hidden">
                          <button
                            onClick={() => copyId(log.batch_id)}
                            title={log.batch_id}
                            className="font-mono text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            {shortId(log.batch_id)}
                            <span className="text-gray-300">{copiedId === log.batch_id ? '✓' : '⎘'}</span>
                          </button>
                        </td>
                        {/* File Name */}
                        <td className="px-3 py-2.5 overflow-hidden">
                          <span className="text-gray-900 font-medium truncate block" title={log.file_name}>
                            {log.file_name}
                          </span>
                          {log.run_id && (
                            <span className="text-[10px] text-gray-400 font-mono truncate block" title={log.run_id}>
                              run:{log.run_id.slice(0, 8)}
                            </span>
                          )}
                        </td>
                        {/* Uploaded By */}
                        <td className="px-3 py-2.5 text-gray-600 truncate">{log.uploaded_by ?? '—'}</td>
                        {/* Phase */}
                        <td className="px-3 py-2.5 overflow-hidden"><PhasePill phase={log.phase} /></td>
                        {/* Counts */}
                        <td className="px-3 py-2.5 text-gray-700 font-mono">{log.record_count_total}</td>
                        <td className="px-3 py-2.5 text-green-700 font-mono font-semibold">{log.record_count_success}</td>
                        <td className="px-3 py-2.5 overflow-hidden">
                          <span className={`font-mono font-semibold ${log.record_count_failed > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {log.record_count_failed}
                          </span>
                        </td>
                        {/* Error count */}
                        <td className="px-3 py-2.5 overflow-hidden">
                          {errCount > 0 ? (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : log.batch_id)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors"
                            >
                              {errCount} {isExpanded ? '▲' : '▼'}
                            </button>
                          ) : (
                            <span className="text-gray-300 text-[10px]">—</span>
                          )}
                        </td>
                        {/* Dates */}
                        <td className="px-3 py-2.5 text-gray-500 truncate text-[11px]">{fmtDate(log.uploaded_at)}</td>
                        <td className="px-3 py-2.5 text-gray-500 truncate text-[11px]">{fmtDate(log.done_at)}</td>
                      </tr>

                      {/* Expanded error detail */}
                      {isExpanded && errCount > 0 && (
                        <tr className="border-b border-red-100 bg-red-50/40">
                          <td colSpan={10} className="px-6 py-3">
                            <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest mb-2">
                              Row-Level Anomalies — {errCount} error{errCount !== 1 ? 's' : ''}
                            </p>
                            <div className="overflow-x-auto">
                              <table className="text-[11px] w-full">
                                <thead>
                                  <tr className="text-gray-500 font-bold uppercase tracking-widest text-[9px]">
                                    <th className="pr-6 py-1 text-left">Row</th>
                                    <th className="pr-6 py-1 text-left">Field</th>
                                    <th className="pr-6 py-1 text-left">Value</th>
                                    <th className="py-1 text-left">Error</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(log.error_summary_payload ?? []).map((e, i) => (
                                    <tr key={i} className="border-t border-red-100">
                                      <td className="pr-6 py-1 font-mono text-gray-600">{e.row}</td>
                                      <td className="pr-6 py-1 font-mono text-blue-700">{e.field}</td>
                                      <td className="pr-6 py-1 font-mono text-gray-600 truncate max-w-[160px]" title={String(e.value ?? '')}>
                                        {e.value != null && e.value !== '' ? String(e.value) : <span className="text-gray-300 italic">empty</span>}
                                      </td>
                                      <td className="py-1 text-red-700">{e.error}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Page {page} of {totalPages} · {total} total</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >‹ Prev</button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >Next ›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
