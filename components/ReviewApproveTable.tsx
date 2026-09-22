'use client';
import React, { useMemo, useState } from 'react';
import { ENUM_PROPERTY_TYPE, ENUM_FURNISHING, ENUM_STATUS, UNIT_CONFIGS_FULL } from '@/lib/importSchema';
import { actionBadge } from './StructuredImportShared';

export type ConflictField = { existing: unknown; incoming: unknown };

export type StagedRecord = {
  id: string;
  row_index: number;
  raw_data: Record<string, unknown>;
  resolved_data: Record<string, unknown>;
  match_type: string;
  conflict_fields: Record<string, ConflictField> | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_notes?: string;
};

type Decision = 'approved' | 'rejected' | null;

const UNIT_STATUS_PILL: Record<string, string> = {
  Available: 'bg-green-50 text-green-700 border-green-200',
  Leased: 'bg-orange-50 text-orange-700 border-orange-200',
  Reserved: 'bg-blue-50 text-blue-700 border-blue-200',
  Under_Maintenance: 'bg-gray-100 text-gray-600 border-gray-200',
};

function StatusPill({ value }: { value: unknown }) {
  const v = value == null ? '' : String(value);
  if (!v) return <span className="text-gray-300 text-xs">—</span>;
  const cls = UNIT_STATUS_PILL[v] ?? 'bg-gray-50 text-gray-600 border-gray-200';
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>{v.replace(/_/g, ' ')}</span>;
}

function formatRent(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return `QAR ${n.toLocaleString()}`;
}

function LinksCell({ mapUrl, mediaUrl }: { mapUrl: unknown; mediaUrl: unknown }) {
  const map = typeof mapUrl === 'string' && mapUrl ? mapUrl : null;
  const media = typeof mediaUrl === 'string' && mediaUrl ? mediaUrl : null;
  if (!map && !media) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="flex items-center gap-1 text-xs whitespace-nowrap overflow-hidden">
      {map && <a href={map} target="_blank" rel="noopener noreferrer" title={map} className="text-blue-600 hover:text-blue-700 underline shrink-0">Map</a>}
      {map && media && <span className="text-gray-300 shrink-0">·</span>}
      {media && <a href={media} target="_blank" rel="noopener noreferrer" title={media} className="text-blue-600 hover:text-blue-700 underline shrink-0">Media</a>}
    </div>
  );
}

const PAGE_SIZES = [25, 50, 100];

export default function ReviewApproveTable({
  runId,
  records,
  decisions,
  notes,
  onDecide,
  onNotes,
  onApproveAll,
  onRejectAll,
  onSubmit,
  onBack,
  isProcessing,
}: {
  runId: string | null;
  records: StagedRecord[];
  decisions: Record<string, Decision>;
  notes: Record<string, string>;
  onDecide: (id: string, decision: 'approved' | 'rejected') => void;
  onNotes: (id: string, note: string) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onSubmit: () => void;
  onBack: () => void;
  isProcessing: boolean;
}) {
  const [search, setSearch] = useState('');
  const [filterDecision, setFilterDecision] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [filterMatch, setFilterMatch] = useState<'all' | 'new' | 'update' | 'conflict'>('all');
  const [filterType, setFilterType] = useState('');
  const [filterConfig, setFilterConfig] = useState('');
  const [filterFurnishing, setFilterFurnishing] = useState('');
  const [filterUnitStatus, setFilterUnitStatus] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [minRent, setMinRent] = useState('');
  const [maxRent, setMaxRent] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const zoneOptions = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach((r) => {
      const code = r.resolved_data.zone_code;
      if (code !== null && code !== undefined && code !== '') map.set(String(code), String(r.resolved_data.zone ?? ''));
    });
    return Array.from(map.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [records]);

  const resetToFirstPage = () => setPage(1);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      const d = r.resolved_data;
      const decision = decisions[r.id] ?? null;
      if (filterDecision !== 'all' && (decision ?? 'pending') !== filterDecision) return false;
      if (filterMatch !== 'all' && r.match_type !== filterMatch) return false;
      if (filterType && d.type !== filterType) return false;
      if (filterConfig && d.config !== filterConfig) return false;
      if (filterFurnishing && d.furnishing !== filterFurnishing) return false;
      if (filterUnitStatus && d.status !== filterUnitStatus) return false;
      if (filterZone && String(d.zone_code ?? '') !== filterZone) return false;
      if (minRent || maxRent) {
        const rent = Number(d.rent);
        if (!Number.isFinite(rent)) return false;
        if (minRent && rent < Number(minRent)) return false;
        if (maxRent && rent > Number(maxRent)) return false;
      }
      if (q) {
        const hay = [d.property, d.unit_no, d.unit_code, d.realtor_moci, d.realtor_name]
          .map((v) => String(v ?? '').toLowerCase())
          .join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, decisions, filterDecision, filterMatch, filterType, filterConfig, filterFurnishing, filterUnitStatus, filterZone, minRent, maxRent, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageRecords = filteredRecords.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  const decidedCount = records.filter((r) => decisions[r.id]).length;
  const approvedCount = records.filter((r) => decisions[r.id] === 'approved').length;
  const rejectedCount = records.filter((r) => decisions[r.id] === 'rejected').length;
  const pendingCount = records.length - decidedCount;

  const allFilteredSelected = filteredRecords.length > 0 && filteredRecords.every((r) => selectedIds.has(r.id));

  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredRecords.forEach((r) => next.delete(r.id));
      else filteredRecords.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function decideSelected(decision: 'approved' | 'rejected') {
    selectedIds.forEach((id) => onDecide(id, decision));
  }

  const filterSelect = (
    value: string,
    onChange: (v: string) => void,
    allLabel: string,
    options: readonly string[],
  ) => (
    <select
      value={value}
      onChange={(e) => { onChange(e.target.value); resetToFirstPage(); }}
      className="bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-blue-500"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
    </select>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Review & Approve</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Run ID: <span className="font-mono">{runId}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="text-xs px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 font-semibold"
          >← Back to Match & Review</button>
          <button
            onClick={onApproveAll}
            className="text-xs px-3 py-1.5 border border-green-500 text-green-700 rounded-lg hover:bg-green-50 font-semibold"
          >Approve All</button>
          <button
            onClick={onRejectAll}
            className="text-xs px-3 py-1.5 border border-red-400 text-red-600 rounded-lg hover:bg-red-50 font-semibold"
          >Reject All</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Records', count: records.length, color: '#111827' },
          { label: 'Pending', count: pendingCount, color: '#6b7280' },
          { label: 'Approved', count: approvedCount, color: '#22c55e' },
          { label: 'Rejected', count: rejectedCount, color: '#ef4444' },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border border-gray-200 p-4">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">{t.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: t.color }}>{t.count}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetToFirstPage(); }}
          placeholder="Search property, unit, realtor…"
          className="flex-1 min-w-[200px] bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-blue-500"
        />
        <select
          value={filterDecision}
          onChange={(e) => { setFilterDecision(e.target.value as typeof filterDecision); resetToFirstPage(); }}
          className="bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Reviews</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={filterMatch}
          onChange={(e) => { setFilterMatch(e.target.value as typeof filterMatch); resetToFirstPage(); }}
          className="bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Match Types</option>
          <option value="new">New</option>
          <option value="update">Update</option>
          <option value="conflict">Conflict</option>
        </select>
        {filterSelect(filterUnitStatus, setFilterUnitStatus, 'All Status', ENUM_STATUS)}
        {filterSelect(filterFurnishing, setFilterFurnishing, 'Any Furnishing', ENUM_FURNISHING)}
        {filterSelect(filterType, setFilterType, 'All Types', ENUM_PROPERTY_TYPE)}
        {filterSelect(filterConfig, setFilterConfig, 'All Configs', UNIT_CONFIGS_FULL)}
        <select
          value={filterZone}
          onChange={(e) => { setFilterZone(e.target.value); resetToFirstPage(); }}
          className="bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Districts</option>
          {zoneOptions.map(([code, district]) => (
            <option key={code} value={code}>{code}{district ? ` — ${district}` : ''}</option>
          ))}
        </select>
        <input
          value={minRent}
          onChange={(e) => { setMinRent(e.target.value.replace(/[^\d]/g, '')); resetToFirstPage(); }}
          placeholder="Min rent"
          className="w-24 bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-blue-500"
        />
        <input
          value={maxRent}
          onChange={(e) => { setMaxRent(e.target.value.replace(/[^\d]/g, '')); resetToFirstPage(); }}
          placeholder="Max rent"
          className="w-24 bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-blue-500"
        />
      </div>
      <p className="text-[11px] text-gray-400">Showing {filteredRecords.length} of {records.length} records</p>

      {/* Bulk-selection panel */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-xs font-semibold text-blue-800">{selectedIds.size} record{selectedIds.size === 1 ? '' : 's'} selected</p>
          <div className="flex gap-2">
            <button
              onClick={() => decideSelected('approved')}
              className="text-xs px-3 py-1 rounded-full font-semibold border border-green-500 text-green-700 hover:bg-green-100"
            >Approve Selected</button>
            <button
              onClick={() => decideSelected('rejected')}
              className="text-xs px-3 py-1 rounded-full font-semibold border border-red-400 text-red-600 hover:bg-red-100"
            >Reject Selected</button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs px-3 py-1 rounded-full font-semibold border border-gray-300 text-gray-600 hover:bg-gray-100"
            >Clear</button>
          </div>
        </div>
      )}

      {/* Table — table-fixed + percentage colgroup keeps every field on screen, no horizontal scroll */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-xs table-fixed">
          <colgroup>
            <col style={{ width: '3%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '4.5%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '4.5%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-2 py-2.5">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} />
              </th>
              <th className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Match</th>
              <th className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Property / Unit</th>
              <th className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Realtor</th>
              <th className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Zone / District</th>
              <th className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Config</th>
              <th className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Furnish.</th>
              <th className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Bath</th>
              <th className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Kitchen</th>
              <th className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Parking</th>
              <th className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Rent/mo</th>
              <th className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Links</th>
              <th className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRecords.map((r) => {
              const d = r.resolved_data;
              const decision = decisions[r.id] ?? null;
              const expanded = expandedIds.has(r.id);
              const rowTint = decision === 'approved' ? 'bg-green-50/40' : decision === 'rejected' ? 'bg-red-50/40' : '';
              return (
                <React.Fragment key={r.id}>
                  <tr className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${rowTint}`}>
                    <td className="px-2 py-2.5">
                      <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} />
                    </td>
                    <td className="px-2 py-2.5">{actionBadge(r.match_type)}</td>
                    <td className="px-2 py-2.5 overflow-hidden">
                      <p className="font-semibold text-gray-900 text-xs truncate">{String(d.property ?? '—')}</p>
                      <p className="text-[10px] text-gray-400 truncate">{String(d.unit_code ?? d.unit_no ?? '—')}</p>
                    </td>
                    <td className="px-2 py-2.5 overflow-hidden">
                      <p className="text-gray-800 text-xs font-medium truncate">{String(d.realtor_name ?? '—')}</p>
                    </td>
                    <td className="px-2 py-2.5 overflow-hidden">
                      <p className="text-gray-800 text-xs font-medium truncate">{String(d.zone_code ?? '—')}</p>
                      <p className="text-[10px] text-gray-400 truncate">{String(d.zone ?? '')}</p>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-gray-700 truncate">{String(d.type ?? '—')}</td>
                    <td className="px-2 py-2.5 text-xs text-gray-700 truncate">{String(d.config ?? '—')}</td>
                    <td className="px-2 py-2.5 text-xs text-gray-700 truncate">{String(d.furnishing ?? '—')}</td>
                    <td className="px-2 py-2.5 text-xs text-gray-700 truncate">{String(d.bathrooms ?? '—')}</td>
                    <td className="px-2 py-2.5 text-xs text-gray-700 truncate">{String(d.kitchen ?? '—')}</td>
                    <td className="px-2 py-2.5 text-xs text-gray-700 truncate">{String(d.parking ?? '—')}</td>
                    <td className="px-2 py-2.5 text-xs font-semibold text-gray-900 truncate">{formatRent(d.rent)}</td>
                    <td className="px-2 py-2.5 overflow-hidden"><StatusPill value={d.status} /></td>
                    <td className="px-2 py-2.5 overflow-hidden"><LinksCell mapUrl={d.location_map_url} mediaUrl={d.media_url} /></td>
                    <td className="px-2 py-2.5 overflow-hidden">
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <button
                          onClick={() => onDecide(r.id, 'approved')}
                          title="Approve"
                          className={`w-6 h-6 rounded-full flex items-center justify-center border font-bold text-[11px] transition-colors ${decision === 'approved' ? 'bg-green-600 text-white border-green-600' : 'border-green-500 text-green-600 hover:bg-green-50'}`}
                        >✓</button>
                        <button
                          onClick={() => onDecide(r.id, 'rejected')}
                          title="Reject"
                          className={`w-6 h-6 rounded-full flex items-center justify-center border font-bold text-[11px] transition-colors ${decision === 'rejected' ? 'bg-red-600 text-white border-red-600' : 'border-red-400 text-red-500 hover:bg-red-50'}`}
                        >✕</button>
                        <button
                          onClick={() => toggleExpand(r.id)}
                          title={expanded ? 'Hide details' : 'Show details'}
                          className="text-[10px] text-blue-600 underline ml-0.5"
                        >{expanded ? 'Hide' : 'More'}</button>
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <td colSpan={15} className="px-6 py-4">
                        <input
                          className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs bg-white"
                          placeholder="Reviewer notes (optional)"
                          value={notes[r.id] ?? ''}
                          onChange={(e) => onNotes(r.id, e.target.value)}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {pageRecords.length === 0 && (
              <tr>
                <td colSpan={15} className="px-6 py-10 text-center text-xs text-gray-400">No records match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); resetToFirstPage(); }}
            className="bg-white border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
          >
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>Page {clampedPage} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={clampedPage === 1}
            className="px-2.5 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
          >‹ Prev</button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={clampedPage === totalPages}
            className="px-2.5 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
          >Next ›</button>
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-400">{decidedCount}/{records.length} decided</p>
        <button
          disabled={decidedCount === 0 || isProcessing}
          onClick={onSubmit}
          className="px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-green-700 transition-colors"
        >
          {isProcessing ? 'Submitting…' : `Submit ${decidedCount} Decision${decidedCount !== 1 ? 's' : ''} →`}
        </button>
      </div>
    </div>
  );
}
