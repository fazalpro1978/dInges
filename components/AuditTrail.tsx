'use client';
import React, { useEffect, useState } from 'react';
import supabase from '../lib/supabaseClient';

type AuditRow = {
  id:            string;
  created_at:    string;
  smart_code:    string;
  field_changed: string;
  reason_code:   string;
  reason_text:   string | null;
  value_before:  string | null;
  value_after:   string | null;
  override_by:   string;
  cr_registry:   { building_name: string | null; floor_ref: string | null; unit_ref: string | null; status: string } | null;
};

const REASON_COLORS: Record<string, string> = {
  CONFIG_MISMATCH:   'bg-red-100 text-red-700',
  ENTITY_MISMATCH:   'bg-red-100 text-red-700',
  ZONE_MISMATCH:     'bg-red-100 text-red-700',
  AGENT_MISMATCH:    'bg-red-100 text-red-700',
  DUPLICATE_OVERRIDE:'bg-amber-100 text-amber-700',
  RE_UPLOAD_UPDATE:  'bg-blue-100 text-blue-700',
  SOURCE_ERROR:      'bg-orange-100 text-orange-700',
  SYSTEM_ERROR:      'bg-orange-100 text-orange-700',
  OTHER:             'bg-gray-100 text-gray-700',
};

type Props = {
  isSuperuser: boolean;
};

export default function AuditTrail({ isSuperuser }: Props) {
  const [rows, setRows]           = useState<AuditRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [codeFilter, setCodeFilter]     = useState('');
  const [promotable, setPromotable]     = useState<{ reason_code: string; count: number }[]>([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const params = new URLSearchParams({ page: '1' });
      if (reasonFilter) params.set('reason_code', reasonFilter);
      if (codeFilter)   params.set('smart_code', codeFilter);
      const res  = await fetch(`/api/code-registry/audit?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setRows(data.overrides ?? []);
      setTotal(data.total ?? 0);
      setPromotable(data.promotablePatterns ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [reasonFilter, codeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 flex-wrap">
        <span className="text-xs font-bold text-gray-700">Override Audit Trail</span>
        <select
          value={reasonFilter}
          onChange={e => setReasonFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-0.5 text-xs bg-white focus:outline-none"
        >
          <option value="">All Reasons</option>
          {Object.keys(REASON_COLORS).map(r => (
            <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Smart Code prefix…"
          value={codeFilter}
          onChange={e => setCodeFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-blue-400 w-36"
        />
        <button onClick={load} className="text-xs text-blue-600 hover:underline">Refresh</button>
        <span className="ml-auto text-xs text-gray-400">{total} override{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Promotable patterns (superuser only) */}
      {isSuperuser && promotable.length > 0 && (
        <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 flex gap-2 flex-wrap">
          <span className="text-[9px] font-bold text-purple-700 uppercase tracking-wide self-center">Promotable Patterns:</span>
          {promotable.map(p => (
            <span key={p.reason_code} className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-semibold">
              {p.reason_code.replace(/_/g, ' ')} × {p.count}
              <button className="ml-1 text-purple-500 hover:text-purple-700 underline text-[9px]">Promote →</button>
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="px-4 py-6 text-xs text-gray-400 text-center">Loading…</div>
      ) : error ? (
        <div className="px-4 py-3 text-xs text-red-600">{error}</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-6 text-xs text-gray-400 text-center">No overrides recorded for this batch.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                <th className="px-3 py-2 text-left">Timestamp</th>
                <th className="px-3 py-2 text-left">Smart Code Before</th>
                <th className="px-3 py-2 text-left">Smart Code After</th>
                <th className="px-3 py-2 text-left">Field</th>
                <th className="px-3 py-2 text-left">Reason</th>
                <th className="px-3 py-2 text-left">Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-3 py-2 font-mono text-red-600 line-through">{row.value_before ?? row.smart_code}</td>
                  <td className="px-3 py-2 font-mono text-green-700 font-bold">{row.value_after ?? row.smart_code}</td>
                  <td className="px-3 py-2 text-gray-600">{row.field_changed}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${REASON_COLORS[row.reason_code] ?? 'bg-gray-100 text-gray-700'}`}>
                      {row.reason_code.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate" title={row.reason_text ?? ''}>
                    {row.reason_text || <span className="italic">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
