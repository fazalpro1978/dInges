'use client';
import React from 'react';
import type { ExistingMatch, CRCardState } from './CodeRegistryPanel';

type Props = {
  cardIndex:      number;
  record:         { property?: string; unit_no?: string; config?: string; rent?: number; type?: string };
  crState:        CRCardState;
  onClose:        () => void;
  onResolve:      (resolution: CRCardState['resolution'], linkedCode?: string, linkedRegistryId?: string) => void;
  overrideReason: string;
  setOverrideReason: (r: string) => void;
  overrideText:   string;
  setOverrideText:   (t: string) => void;
};

const REASON_CODES = [
  'CONFIG_MISMATCH', 'ENTITY_MISMATCH', 'ZONE_MISMATCH', 'AGENT_MISMATCH',
  'DUPLICATE_OVERRIDE', 'RE_UPLOAD_UPDATE', 'SOURCE_ERROR', 'SYSTEM_ERROR', 'OTHER',
];

function FieldRow({ label, a, b, match }: { label: string; a: string; b: string; match: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-0 mb-1.5 rounded overflow-hidden border border-gray-100">
      <div className={`px-2 py-1 text-xs ${match ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'} font-medium`}>
        <span className="text-[9px] text-gray-400 block">{label} · Incoming</span>
        {a || <span className="italic text-gray-400">—</span>}
      </div>
      <div className={`px-2 py-1 text-xs ${match ? 'bg-green-50 text-green-800' : 'bg-amber-100 text-amber-900'} font-medium border-l border-gray-100`}>
        <span className="text-[9px] text-gray-400 block">{label} · Canonical</span>
        {b || <span className="italic text-gray-400">—</span>}
      </div>
    </div>
  );
}

export default function InspectionDrawer({
  cardIndex, record, crState, onClose, onResolve,
  overrideReason, setOverrideReason, overrideText, setOverrideText,
}: Props) {
  const match = crState.existingMatches[0];
  if (!match) return null;

  const canResolve = !!overrideReason;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white shadow-2xl border-l border-gray-200 overflow-y-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
          <div>
            <p className="text-xs font-bold text-gray-800">Duplicate Inspection</p>
            <p className="text-[10px] text-gray-400">Record #{cardIndex + 1} · {crState.existingMatches.length} existing match{crState.existingMatches.length > 1 ? 'es' : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
        </div>

        {/* Existing matches list */}
        {crState.existingMatches.length > 1 && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
            <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wide mb-1">All prefix matches</p>
            {crState.existingMatches.map(m => (
              <p key={m.smart_code} className="font-mono text-[10px] text-amber-800">{m.smart_code} · {m.status}</p>
            ))}
          </div>
        )}

        {/* Side-by-side comparison */}
        <div className="px-4 py-3 flex-1">
          <div className="flex gap-1 mb-2 text-[9px] font-bold uppercase tracking-wide">
            <span className="flex-1 text-blue-600">Incoming Record</span>
            <span className="flex-1 text-green-600 pl-2">Canonical (cr_registry)</span>
          </div>

          <FieldRow label="Property" a={record.property ?? '—'} b={match.building_name ?? '—'} match={(record.property ?? '') === (match.building_name ?? '')} />
          <FieldRow label="Unit No."  a={record.unit_no  ?? '—'} b={match.unit_ref      ?? '—'} match={(record.unit_no  ?? '') === (match.unit_ref  ?? '')} />
          <FieldRow label="Floor"     a={'—'}                    b={match.floor_ref     ?? '—'} match={false} />
          <FieldRow label="Type"      a={record.type     ?? '—'} b={'—'}                        match={false} />
          <FieldRow label="Config"    a={record.config   ?? '—'} b={'—'}                        match={false} />

          {/* Smart Code collision */}
          <div className="mt-3 mb-3 p-2 bg-amber-50 border border-amber-200 rounded">
            <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wide mb-1">Smart Code Collision (Tier 4 — Prefix Match)</p>
            <p className="font-mono text-sm font-bold text-amber-800 tracking-wider">{match.smart_code}</p>
            <p className="text-[10px] text-amber-600 mt-0.5">Status: {match.status} · Prefix: {crState.prefix}</p>
          </div>

          {/* Resolution mandatory feedback */}
          <p className="text-[9px] font-bold text-gray-600 uppercase tracking-wide mb-1">Resolution (required before advancing)</p>
          <div className="mb-2">
            <label className="text-[9px] text-gray-400 block mb-0.5">Reason Code *</label>
            <select
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-blue-400"
            >
              <option value="">— Select reason —</option>
              {REASON_CODES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label className="text-[9px] text-gray-400 block mb-0.5">Additional Context</label>
            <textarea
              rows={2}
              value={overrideText}
              onChange={e => setOverrideText(e.target.value)}
              placeholder="Explain why this isn't a true duplicate…"
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs resize-none focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Resolution buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              disabled={!canResolve}
              onClick={() => onResolve('link', match.smart_code)}
              className="py-2 text-[10px] font-bold rounded border border-green-400 text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-40"
            >
              Link to Existing<br/>
              <span className="font-normal text-[9px]">No new code</span>
            </button>
            <button
              disabled={!canResolve}
              onClick={() => onResolve('overwrite', match.smart_code)}
              className="py-2 text-[10px] font-bold rounded border border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40"
            >
              Overwrite / Update<br/>
              <span className="font-normal text-[9px]">Retain code</span>
            </button>
            <button
              disabled={!canResolve}
              onClick={() => onResolve('force_new')}
              className="py-2 text-[10px] font-bold rounded border border-red-400 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-40"
            >
              Force Create New<br/>
              <span className="font-normal text-[9px]">New sequence</span>
            </button>
          </div>
          {!canResolve && (
            <p className="text-[10px] text-amber-600 mt-1">Select a reason code to enable resolution buttons.</p>
          )}
        </div>
      </div>
    </div>
  );
}
