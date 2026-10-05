'use client';

import React, { useEffect, useState, useCallback } from 'react';
import TopBar from '@/components/TopBar';
import { useNav } from '@/components/AppShell';
import Link from 'next/link';
import supabase from '@/lib/supabaseClient';

interface ExceptionRecord {
  id: string;
  run_id: string;
  row_index: number;
  status: string;
  match_type: string;
  match_confidence: number;
  reviewer_notes: string | null;
  staged_at: string;
  property: string | null;
  unit_no: string | null;
  type: string | null;
  exception_type: string;
  batch_id:     string | null;
  file_name:    string | null;
  uploaded_at:  string | null;
  resolved_data: Record<string, unknown> | null;
  delta_status: string | null;
  run: { source_file: string; uploaded_by: string; created_at: string } | null;
}

function fmtUploadedAt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function shortBatchId(id: string | null): string {
  return id ? id.slice(0, 8).toUpperCase() : '—';
}

// Parse field names from a SCHEMA ERROR reviewer_notes string
function parseSchemaErrorFields(notes: string | null): string[] {
  if (!notes?.startsWith('[SCHEMA ERROR]')) return [];
  const body = notes.replace('[SCHEMA ERROR]', '').trim();
  // e.g. "furnishing: invalid value "X"; type: null"
  return body.split(';').map(s => s.split(':')[0].trim()).filter(Boolean);
}

const EXCEPTION_COLOURS: Record<string, { bg: string; text: string; dot: string }> = {
  'Schema Error':   { bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444' },
  'Low Confidence': { bg: '#fffbeb', text: '#b45309', dot: '#f59e0b' },
  'Flagged':        { bg: '#f0f9ff', text: '#0369a1', dot: '#38bdf8' },
};

function exceptionStyle(type: string) {
  const key = Object.keys(EXCEPTION_COLOURS).find(k => type.startsWith(k));
  return EXCEPTION_COLOURS[key ?? 'Flagged'];
}

export default function ExceptionsPage() {
  const { openNav } = useNav();
  const [exceptions, setExceptions] = useState<ExceptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  // Per-row action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixFields, setFixFields] = useState<Record<string, string>>({});

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const showToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 3500);
  };

  const reload = () => {
    setLoading(true);
    fetch('/api/exceptions')
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setExceptions(d.exceptions ?? []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const clearScope = async (scope: 'schema_errors' | 'low_confidence' | 'all') => {
    const labels: Record<string, string> = {
      schema_errors:  'all Schema Errors',
      low_confidence: 'all Low-Confidence matches',
      all:            'ALL exceptions',
    };
    if (!confirm(`Clear ${labels[scope]}? This cannot be undone.`)) return;
    setClearing(true);
    const token = await getToken();
    try {
      const res = await fetch('/api/exceptions', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      reload();
    } catch (e) {
      alert(`Clear failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setClearing(false);
    }
  };

  const approveRecord = async (id: string) => {
    setActionLoading(id);
    const token = await getToken();
    try {
      const res = await fetch(`/api/exceptions/${id}/approve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? data.message ?? 'Approve failed');
      showToast('Record approved and sent to REIMS queue.');
      reload();
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setActionLoading(null);
    }
  };

  const rejectRecord = async (id: string) => {
    setActionLoading(id);
    const token = await getToken();
    try {
      const res = await fetch(`/api/exceptions/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ notes: 'Rejected via Exception Queue' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Reject failed');
      showToast('Record rejected.');
      reload();
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setActionLoading(null);
    }
  };

  const startFix = (ex: ExceptionRecord) => {
    const errorFields = parseSchemaErrorFields(ex.reviewer_notes);
    const prefill: Record<string, string> = {};
    if (ex.resolved_data) {
      for (const f of errorFields) {
        prefill[f] = String(ex.resolved_data[f] ?? '');
      }
    }
    setFixFields(prefill);
    setFixingId(ex.id);
  };

  const saveFix = async (id: string) => {
    setActionLoading(id);
    const token = await getToken();
    try {
      const res = await fetch(`/api/exceptions/${id}/fix`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ fields: fixFields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? data.message ?? 'Fix failed');
      showToast(data.ok ? 'Record fixed and approved.' : `Schema errors remain: ${data.message}`);
      setFixingId(null);
      reload();
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setActionLoading(null);
    }
  };

  const schemaErrors  = exceptions.filter(e => e.status === 'schema_error' || e.reviewer_notes?.startsWith('[SCHEMA ERROR]'));
  const lowConfidence = exceptions.filter(e => !e.reviewer_notes?.startsWith('[SCHEMA ERROR]') && e.match_confidence < 0.85);

  return (
    <div style={{ minHeight: '100vh', background: '#1b1e23' }}>
      <TopBar
        onMenuClick={openNav}
        title="Exception Queue"
        subtitle="Low-confidence matches · Schema errors"
        right={
          <Link href="/" className="text-xs font-medium" style={{ color: '#3daee9' }}>
            ← Ingest Pipeline
          </Link>
        }
      />

      <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">

        {/* Toast */}
        {actionToast && (
          <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-xs px-4 py-2.5 rounded-lg shadow-lg border border-gray-700">
            {actionToast}
          </div>
        )}

        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Schema Errors', count: schemaErrors.length, colour: '#ef4444', sub: 'Blocked from REIMS — fix required' },
            { label: 'Low Confidence', count: lowConfidence.length, colour: '#f59e0b', sub: 'Fuzzy matches needing review' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 px-6 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${s.colour}20` }}>
                <div className="w-3 h-3 rounded-full" style={{ background: s.colour }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{s.count}</p>
                <p className="text-xs font-semibold text-gray-700">{s.label}</p>
                <p className="text-[11px] text-gray-400">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">All Exceptions</h2>
              <p className="text-xs text-gray-400 mt-0.5">Records that require manual review before they can proceed to REIMS</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={clearing || loading || schemaErrors.length === 0}
                onClick={() => clearScope('schema_errors')}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {clearing ? '…' : 'Clear Schema Errors'}
              </button>
              <button
                disabled={clearing || loading || lowConfidence.length === 0}
                onClick={() => clearScope('low_confidence')}
                className="text-xs px-3 py-1.5 rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {clearing ? '…' : 'Clear Low Confidence'}
              </button>
              <button
                disabled={clearing || loading || exceptions.length === 0}
                onClick={() => clearScope('all')}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {clearing ? 'Clearing…' : 'Clear All'}
              </button>
              <button
                onClick={reload}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium disabled:opacity-40"
              >
                Refresh
              </button>
            </div>
          </div>

          {loading && (
            <div className="px-6 py-12 text-center text-sm text-gray-400">Loading exceptions…</div>
          )}
          {error && (
            <div className="px-6 py-6 text-center text-sm text-red-500">{error}</div>
          )}
          {!loading && !error && exceptions.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm font-semibold text-gray-700">No exceptions</p>
              <p className="text-xs text-gray-400 mt-1">All records passed schema validation and confidence thresholds</p>
            </div>
          )}

          {!loading && exceptions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[1400px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-semibold uppercase tracking-wide text-[10px]">
                    <th className="px-4 py-2.5 text-left">Flag</th>
                    <th className="px-4 py-2.5 text-left">Row</th>
                    <th className="px-4 py-2.5 text-left">Property</th>
                    <th className="px-4 py-2.5 text-left">Unit No.</th>
                    <th className="px-4 py-2.5 text-left">Type</th>
                    <th className="px-4 py-2.5 text-left">File Name</th>
                    <th className="px-4 py-2.5 text-left">Batch ID</th>
                    <th className="px-4 py-2.5 text-left">Uploaded At</th>
                    <th className="px-4 py-2.5 text-left">Match</th>
                    <th className="px-4 py-2.5 text-left w-56">Notes</th>
                    <th className="px-4 py-2.5 text-left">Status</th>
                    <th className="px-4 py-2.5 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {exceptions.map(ex => {
                    const style = exceptionStyle(ex.exception_type);
                    const isActing = actionLoading === ex.id;
                    const isFixing = fixingId === ex.id;
                    // Schema errors land as status='rejected' by the automated validator but
                    // are still fixable — only hide actions for non-schema manual rejections/approvals.
                    const alreadyDone = ex.status === 'approved' ||
                      (ex.status === 'rejected' && !isSchemaError);
                    const isSchemaError = ex.reviewer_notes?.startsWith('[SCHEMA ERROR]');
                    const errorFields = parseSchemaErrorFields(ex.reviewer_notes);

                    return (
                      <React.Fragment key={ex.id}>
                        <tr className={`hover:bg-gray-50 text-gray-800 ${isFixing ? 'bg-blue-50' : ''}`}>
                          {/* Flag */}
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: style.bg, color: style.text }}>
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: style.dot }} />
                              {ex.exception_type}
                            </span>
                          </td>
                          {/* Row */}
                          <td className="px-4 py-2.5 text-gray-400 font-medium">{ex.row_index + 1}</td>
                          {/* Property */}
                          <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{ex.property ?? '—'}</td>
                          {/* Unit No. */}
                          <td className="px-4 py-2.5 text-blue-700 font-mono whitespace-nowrap">{ex.unit_no ?? '—'}</td>
                          {/* Type */}
                          <td className="px-4 py-2.5 text-violet-700 whitespace-nowrap">{ex.type ?? '—'}</td>
                          {/* File Name */}
                          <td className="px-4 py-2.5 text-gray-600 max-w-[180px]">
                            <span className="block break-words leading-tight text-[11px]" title={ex.file_name ?? ''}>
                              {ex.file_name ?? <span className="text-gray-300">—</span>}
                            </span>
                          </td>
                          {/* Batch ID */}
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {ex.batch_id ? (
                              <span className="font-mono text-[11px] text-blue-600" title={ex.batch_id}>
                                {shortBatchId(ex.batch_id)}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          {/* Uploaded At */}
                          <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-[11px]">
                            {fmtUploadedAt(ex.uploaded_at)}
                          </td>
                          {/* Match */}
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {ex.match_type === 'fuzzy'
                              ? <span className="text-amber-600 font-semibold">Fuzzy {Math.round(ex.match_confidence * 100)}%</span>
                              : <span className="text-gray-500 capitalize">{ex.match_type}</span>}
                          </td>
                          {/* Notes */}
                          <td className="px-4 py-2.5 text-gray-500 max-w-[224px]">
                            <span className="line-clamp-2">{ex.reviewer_notes ?? '—'}</span>
                          </td>
                          {/* Status */}
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                              ex.status === 'schema_error' || isSchemaError ? 'bg-red-100 text-red-700'
                              : ex.status === 'pending'    ? 'bg-blue-100 text-blue-700'
                              : ex.status === 'approved'   ? 'bg-green-100 text-green-700'
                              : ex.status === 'rejected'   ? 'bg-gray-100 text-gray-500'
                              : 'bg-gray-100 text-gray-600'
                            }`}>
                              {ex.status}
                            </span>
                          </td>
                          {/* Actions */}
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {alreadyDone ? (
                              <span className="text-gray-300 text-[11px]">—</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                {/* Confirm/Approve */}
                                <button
                                  onClick={() => approveRecord(ex.id)}
                                  disabled={isActing || isFixing}
                                  title="Approve — send to REIMS queue"
                                  className="w-6 h-6 rounded flex items-center justify-center bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  {isActing ? '…' : '✓'}
                                </button>
                                {/* Fix — only shown for schema errors */}
                                {isSchemaError && errorFields.length > 0 && (
                                  <button
                                    onClick={() => isFixing ? setFixingId(null) : startFix(ex)}
                                    disabled={isActing}
                                    title="Fix fields and approve"
                                    className={`w-6 h-6 rounded flex items-center justify-center border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                      isFixing
                                        ? 'bg-blue-100 text-blue-700 border-blue-300'
                                        : 'bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200'
                                    }`}
                                  >
                                    ✎
                                  </button>
                                )}
                                {/* Reject */}
                                <button
                                  onClick={() => rejectRecord(ex.id)}
                                  disabled={isActing || isFixing}
                                  title="Reject — remove from pipeline"
                                  className="w-6 h-6 rounded flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>

                        {/* Inline fix editor row */}
                        {isFixing && errorFields.length > 0 && (
                          <tr className="bg-blue-50 border-t border-blue-100">
                            <td colSpan={12} className="px-6 py-3">
                              <div className="flex items-start gap-4 flex-wrap">
                                <p className="text-[11px] font-semibold text-blue-700 self-center whitespace-nowrap">
                                  Fix fields:
                                </p>
                                {errorFields.map(field => (
                                  <div key={field} className="flex flex-col gap-0.5">
                                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                                      {field}
                                    </label>
                                    <input
                                      value={fixFields[field] ?? ''}
                                      onChange={e => setFixFields(prev => ({ ...prev, [field]: e.target.value }))}
                                      placeholder={`Enter ${field}`}
                                      className="text-xs px-2 py-1 rounded border border-blue-200 bg-white text-gray-800 w-36 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    />
                                  </div>
                                ))}
                                <div className="flex items-end gap-2 self-end">
                                  <button
                                    onClick={() => saveFix(ex.id)}
                                    disabled={actionLoading === ex.id}
                                    className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {actionLoading === ex.id ? 'Saving…' : 'Save & Approve'}
                                  </button>
                                  <button
                                    onClick={() => setFixingId(null)}
                                    className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
