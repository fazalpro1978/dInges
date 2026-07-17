'use client';

import React, { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import { useNav } from '@/components/AppShell';
import Link from 'next/link';

interface ExceptionRecord {
  id: string;
  run_id: string;
  row_index: number;
  status: string;
  match_type: string;
  match_confidence: number;
  reviewer_notes: string | null;
  created_at: string;
  property: string | null;
  unit_no: string | null;
  type: string | null;
  exception_type: string;
  run: { source_file: string; uploaded_by: string; created_at: string } | null;
}

const EXCEPTION_COLOURS: Record<string, { bg: string; text: string; dot: string }> = {
  'Schema Error':     { bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444' },
  'Low Confidence':   { bg: '#fffbeb', text: '#b45309', dot: '#f59e0b' },
  'Flagged':          { bg: '#f0f9ff', text: '#0369a1', dot: '#38bdf8' },
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

  useEffect(() => {
    fetch('/api/exceptions')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setExceptions(d.exceptions ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const schemaErrors  = exceptions.filter(e => e.status === 'schema_error');
  const lowConfidence = exceptions.filter(e => e.status !== 'schema_error' && e.match_confidence < 0.85);

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

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

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
            <button
              onClick={() => { setLoading(true); fetch('/api/exceptions').then(r => r.json()).then(d => { setExceptions(d.exceptions ?? []); setLoading(false); }); }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium"
            >
              Refresh
            </button>
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
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-semibold">
                    <th className="px-4 py-2.5 text-left">Flag</th>
                    <th className="px-4 py-2.5 text-left">Row</th>
                    <th className="px-4 py-2.5 text-left">Property</th>
                    <th className="px-4 py-2.5 text-left">Unit No.</th>
                    <th className="px-4 py-2.5 text-left">Type</th>
                    <th className="px-4 py-2.5 text-left">Source File</th>
                    <th className="px-4 py-2.5 text-left">Match</th>
                    <th className="px-4 py-2.5 text-left w-64">Notes</th>
                    <th className="px-4 py-2.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {exceptions.map(ex => {
                    const style = exceptionStyle(ex.exception_type);
                    return (
                      <tr key={ex.id} className="hover:bg-gray-50 text-gray-800">
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: style.bg, color: style.text }}>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: style.dot }} />
                            {ex.exception_type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 font-medium">{ex.row_index + 1}</td>
                        <td className="px-4 py-2.5 font-semibold text-gray-900">{ex.property ?? '—'}</td>
                        <td className="px-4 py-2.5 text-blue-700 font-mono">{ex.unit_no ?? '—'}</td>
                        <td className="px-4 py-2.5 text-violet-700">{ex.type ?? '—'}</td>
                        <td className="px-4 py-2.5 text-gray-500 truncate max-w-[160px]" title={ex.run?.source_file ?? ''}>
                          {ex.run?.source_file ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {ex.match_type === 'fuzzy'
                            ? <span className="text-amber-600 font-semibold">Fuzzy {Math.round(ex.match_confidence * 100)}%</span>
                            : <span className="text-gray-500 capitalize">{ex.match_type}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 max-w-[256px]">
                          <span className="line-clamp-2">{ex.reviewer_notes ?? '—'}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                            ex.status === 'schema_error' ? 'bg-red-100 text-red-700'
                            : ex.status === 'pending'    ? 'bg-blue-100 text-blue-700'
                            : ex.status === 'approved'   ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                          }`}>
                            {ex.status}
                          </span>
                        </td>
                      </tr>
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
