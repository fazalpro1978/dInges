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

type PipelineIssue = {
  batch_id:              string;
  run_id:                string;
  file_name:             string;
  uploaded_by:           string;
  created_at:            string;
  review_approve_at?:    string | null;
  record_count_total:    number;
  record_count_success:  number;
};

type PipelineStatus = {
  abandoned: PipelineIssue[];
  stalled:   PipelineIssue[];
  failed:    PipelineIssue[];
  checkedAt: string;
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

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h ago`;
  if (h > 0)   return `${h}h ${m}m ago`;
  return `${m}m ago`;
}

// ── Pipeline Status Panel ────────────────────────────────────────────────────

function StatusPill({ count, label, color }: { count: number; label: string; color: string }) {
  const colors: Record<string, string> = {
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    amber:  'bg-amber-50  border-amber-200  text-amber-700',
    red:    'bg-red-50    border-red-200    text-red-700',
    green:  'bg-green-50  border-green-200  text-green-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${colors[color] ?? colors.green}`}>
      <span className={`w-2 h-2 rounded-full ${count > 0 ? 'bg-current' : 'bg-green-400'}`} />
      {count > 0 ? count : '0'} {label}
    </span>
  );
}

function IssueRow({
  issue,
  type,
  onReinstate,
  reinstating,
}: {
  issue: PipelineIssue;
  type: 'abandoned' | 'stalled' | 'failed';
  onReinstate?: (runId: string) => void;
  reinstating?: boolean;
}) {
  const age = timeAgo(type === 'stalled' && issue.review_approve_at ? issue.review_approve_at : issue.created_at);
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white border border-gray-100 shadow-sm">
      <span className="font-mono text-[10px] text-gray-400 w-20 shrink-0">{shortId(issue.batch_id)}</span>
      <span className="text-xs text-gray-800 font-medium truncate flex-1" title={issue.file_name}>{issue.file_name}</span>
      <span className="text-[10px] text-gray-400 shrink-0">{issue.record_count_total} records</span>
      <span className="text-[10px] text-gray-400 shrink-0">{age}</span>
      <span className="text-[10px] text-gray-500 shrink-0">{issue.uploaded_by}</span>
      {type === 'abandoned' && onReinstate && (
        <button
          onClick={() => onReinstate(issue.run_id)}
          disabled={reinstating}
          className="shrink-0 text-[11px] font-semibold px-3 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white transition-colors"
        >
          {reinstating ? 'Re-queuing…' : 'Re-queue →'}
        </button>
      )}
      {type === 'stalled' && (
        <span className="shrink-0 text-[11px] text-amber-600 font-semibold px-2 py-1 rounded-lg bg-amber-50 border border-amber-200">
          Check REIMS
        </span>
      )}
      {type === 'failed' && (
        <Link href="/" className="shrink-0 text-[11px] font-semibold px-3 py-1 rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors">
          Re-upload
        </Link>
      )}
    </div>
  );
}

function PipelineStatusPanel({
  status,
  loading,
  onRefresh,
  onReinstate,
  reinstatingId,
  toast,
}: {
  status: PipelineStatus | null;
  loading: boolean;
  onRefresh: () => void;
  onReinstate: (runId: string) => void;
  reinstatingId: string | null;
  toast: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const totalIssues = (status?.abandoned.length ?? 0) + (status?.stalled.length ?? 0) + (status?.failed.length ?? 0);
  const allHealthy  = !loading && status !== null && totalIssues === 0;

  // Auto-expand when issues exist
  useEffect(() => {
    if (totalIssues > 0) setExpanded(true);
  }, [totalIssues]);

  return (
    <div className={`rounded-xl border overflow-hidden transition-colors ${totalIssues > 0 ? 'border-orange-200 bg-orange-50/40' : 'border-gray-200 bg-white'}`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${loading ? 'bg-gray-300 animate-pulse' : totalIssues > 0 ? 'bg-orange-500' : 'bg-green-500'}`} />
          <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">Pipeline Health</span>
        </div>

        {loading ? (
          <span className="text-xs text-gray-400">Running system check…</span>
        ) : status ? (
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill count={status.abandoned.length} label="Abandoned" color={status.abandoned.length > 0 ? 'orange' : 'green'} />
            <StatusPill count={status.stalled.length}  label="Stalled in Queue" color={status.stalled.length > 0 ? 'amber' : 'green'} />
            <StatusPill count={status.failed.length}   label="Failed"     color={status.failed.length > 0 ? 'red' : 'green'} />
            {allHealthy && <span className="text-xs text-green-600 font-medium">All pipelines healthy</span>}
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          {status && (
            <span className="text-[10px] text-gray-400">
              Last checked: {fmtDate(status.checkedAt)}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 font-medium transition-colors"
          >
            {loading ? 'Checking…' : 'Run Check'}
          </button>
          {totalIssues > 0 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-gray-500 hover:text-gray-800 font-medium"
            >
              {expanded ? '▲ Hide' : '▼ Details'}
            </button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-xs text-green-700 font-medium">
          {toast}
        </div>
      )}

      {/* Expanded issue list */}
      {expanded && status && totalIssues > 0 && (
        <div className="border-t border-orange-100 px-4 py-3 space-y-4">

          {status.abandoned.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-700 mb-1.5">
                Abandoned — session ended before records reached REIMS
              </p>
              <p className="text-[10px] text-gray-500 mb-2">
                Records are staged but were never approved. Click <strong>Re-queue</strong> to auto-approve and push them to the REIMS vetted queue.
              </p>
              <div className="space-y-1.5">
                {status.abandoned.map(issue => (
                  <IssueRow
                    key={issue.batch_id}
                    issue={issue}
                    type="abandoned"
                    onReinstate={onReinstate}
                    reinstating={reinstatingId === issue.run_id}
                  />
                ))}
              </div>
            </div>
          )}

          {status.stalled.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1.5">
                Stalled in REIMS Queue — records sent but REIMS has not acknowledged
              </p>
              <p className="text-[10px] text-gray-500 mb-2">
                Open REIMS and check the <strong>dInges Queue</strong> tab. If the queue is empty, the REIMS connection may need to be re-established.
              </p>
              <div className="space-y-1.5">
                {status.stalled.map(issue => (
                  <IssueRow key={issue.batch_id} issue={issue} type="stalled" />
                ))}
              </div>
            </div>
          )}

          {status.failed.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-700 mb-1.5">
                Failed — pipeline error encountered
              </p>
              <p className="text-[10px] text-gray-500 mb-2">
                These runs encountered a system error. Expand the row below for the error detail, then re-upload the file.
              </p>
              <div className="space-y-1.5">
                {status.failed.map(issue => (
                  <IssueRow key={issue.batch_id} issue={issue} type="failed" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Flag helpers ──────────────────────────────────────────────────────────────

function rowFlag(log: BatchLog, status: PipelineStatus | null): 'abandoned' | 'stalled' | 'failed' | null {
  if (!status) return null;
  if (status.abandoned.some(i => i.run_id === log.run_id)) return 'abandoned';
  if (status.stalled.some(i  => i.run_id === log.run_id)) return 'stalled';
  if (status.failed.some(i   => i.run_id === log.run_id)) return 'failed';
  return null;
}

const FLAG_BORDER: Record<string, string> = {
  abandoned: 'border-l-4 border-l-orange-400',
  stalled:   'border-l-4 border-l-amber-400',
  failed:    'border-l-4 border-l-red-500',
};

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

  // Pipeline status state
  const [pipelineStatus, setPipelineStatus]     = useState<PipelineStatus | null>(null);
  const [statusLoading, setStatusLoading]       = useState(true);
  const [reinstatingId, setReinstatingId]       = useState<string | null>(null);
  const [reinstateToast, setReinstateToast]     = useState<string | null>(null);

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

  const loadPipelineStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res  = await fetch('/api/pipeline-status', { cache: 'no-store' });
      const data = await res.json() as PipelineStatus & { error?: string };
      if (!res.ok || data.error) return;
      setPipelineStatus(data);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const reinstateRun = useCallback(async (runId: string) => {
    setReinstatingId(runId);
    setReinstateToast(null);
    try {
      const res  = await fetch('/api/pipeline-status/reinstate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      });
      const data = await res.json() as { reinstated?: number; message?: string; error?: string };
      if (!res.ok || data.error) {
        setReinstateToast(`Error: ${data.error}`);
      } else {
        const n = data.reinstated ?? 0;
        setReinstateToast(
          n > 0
            ? `${n} record${n !== 1 ? 's' : ''} re-queued successfully. REIMS will pick them up shortly.`
            : (data.message ?? 'Records already in queue.')
        );
        // Refresh both lists
        await Promise.all([loadPipelineStatus(), load(page, search, filterPhase, filterFrom, filterTo)]);
      }
    } catch {
      setReinstateToast('Network error — please try again.');
    } finally {
      setReinstatingId(null);
      setTimeout(() => setReinstateToast(null), 8000);
    }
  }, [load, loadPipelineStatus, page, search, filterPhase, filterFrom, filterTo]);

  useEffect(() => {
    loadPipelineStatus();
  }, [loadPipelineStatus]);

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

        {/* Pipeline Status Panel */}
        <PipelineStatusPanel
          status={pipelineStatus}
          loading={statusLoading}
          onRefresh={loadPipelineStatus}
          onReinstate={reinstateRun}
          reinstatingId={reinstatingId}
          toast={reinstateToast}
        />

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
                <col style={{ width: '16%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '9%'  }} />
                <col style={{ width: '6%'  }} />
                <col style={{ width: '6%'  }} />
                <col style={{ width: '6%'  }} />
                <col style={{ width: '5%'  }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['Batch ID', 'File Name', 'Uploaded By', 'Phase', 'Total', '✓ OK', '✗ Failed', 'Errors', 'Uploaded At', 'Done At', 'Alert'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const errCount   = log.error_summary_payload?.length ?? 0;
                  const isExpanded = expandedId === log.batch_id;
                  const flag       = rowFlag(log, pipelineStatus);
                  const borderCls  = flag ? FLAG_BORDER[flag] : '';

                  return (
                    <React.Fragment key={log.batch_id}>
                      <tr className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-blue-50/30' : ''} ${borderCls}`}>
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
                        {/* Alert / Action */}
                        <td className="px-3 py-2.5 overflow-hidden">
                          {flag === 'abandoned' && (
                            <button
                              onClick={() => log.run_id && reinstateRun(log.run_id)}
                              disabled={reinstatingId === log.run_id}
                              className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white transition-colors whitespace-nowrap"
                            >
                              {reinstatingId === log.run_id ? 'Re-queuing…' : 'Re-queue →'}
                            </button>
                          )}
                          {flag === 'stalled' && (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg whitespace-nowrap">
                              ⚠ Check REIMS
                            </span>
                          )}
                          {flag === 'failed' && (
                            <Link href="/" className="text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap">
                              Re-upload
                            </Link>
                          )}
                          {!flag && <span className="text-gray-200 text-[10px]">—</span>}
                        </td>
                      </tr>

                      {/* Expanded error detail */}
                      {isExpanded && errCount > 0 && (
                        <tr className="border-b border-red-100 bg-red-50/40">
                          <td colSpan={11} className="px-6 py-3">
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
