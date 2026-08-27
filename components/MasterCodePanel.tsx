'use client';
import React from 'react';
import { buildMasterPrefix } from '@/lib/buildMasterCode';

export type EntityCode  = { entity_code: string; company_name: string };
export type AgentEntry  = { agent_code: string; full_name: string; role?: string | null; [k: string]: unknown };

export type MCState = {
  category:         'R' | 'C';
  entity_code:      string;
  check_status:     'idle' | 'checking' | 'clear' | 'existing';
  existing_matches: Array<{ master_code: string; created_at: string; property_ref?: string | null }>;
  unit_conflicts:   string[];   // smart_codes already in units (e.g. ['RAARAA66-311'])
  override_confirmed: boolean;  // Admin/SU confirmed override after conflict
  generated_code:   string | null;
  date_seg:         string;   // DDMM — locked at check time
  time_seg:         string;   // HHMM — locked at check time
  seq_num:          number;   // starts 100, log-only
  locked:           boolean;  // true after Apply — prefix is immutable
};

type Props = {
  state:         MCState;
  agentCode:     string;   // currently selected agent_code
  zoneCode:      string;
  entityCodes:   EntityCode[];
  agents:        AgentEntry[];
  recordCount:   number;
  onStateChange: (next: Partial<MCState>) => void;
  onAgentChange: (code: string) => void;
  onApply:       () => void;
};

export default function MasterCodePanel({
  state, agentCode, zoneCode, entityCodes, agents, recordCount,
  onStateChange, onAgentChange, onApply,
}: Props) {
  const prefix = buildMasterPrefix({
    category: state.category,
    entity_code: state.entity_code,
    agent_code: agentCode,
    zone_code: zoneCode,
  });

  const prefixOk = prefix !== null;

  const runCheck = async () => {
    if (!prefixOk) return;
    const { getNowSegments } = await import('@/lib/buildMasterCode');
    const { date_seg, time_seg } = getNowSegments();
    onStateChange({ check_status: 'checking', date_seg, time_seg });

    try {
      const token = await (await import('@/lib/supabaseClient')).default.auth.getSession()
        .then(r => r.data.session?.access_token ?? '');
      const res = await fetch(`/api/master-code/check?prefix=${prefix}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      onStateChange({
        check_status:     data.hasConflict ? 'existing' : 'clear',
        existing_matches: data.matches ?? [],
        unit_conflicts:   data.unitConflicts ?? [],
      });
    } catch {
      onStateChange({ check_status: 'idle' });
    }
  };

  const hasUnitConflicts = state.unit_conflicts.length > 0;
  const conflictIsBlocking = state.check_status === 'existing' && !state.override_confirmed;

  const statusColor = {
    idle:     '#6b7280',
    checking: '#3b82f6',
    clear:    '#16a34a',
    existing: '#dc2626',  // red
  }[state.check_status];

  const statusLabel = {
    idle:     prefixOk ? '⬤ Prefix ready — run check' : '◯ Fill Category + Entity',
    checking: '⟳ Checking registry…',
    clear:    '✓ No conflicts — ready to apply',
    existing: hasUnitConflicts
      ? `⛔ ${state.unit_conflicts.length} previously executed unit${state.unit_conflicts.length !== 1 ? 's' : ''} — override required`
      : `⚠ Master Code prefix exists — override required`,
  }[state.check_status];

  const canApply = (state.check_status === 'clear' || (state.check_status === 'existing' && state.override_confirmed))
    && state.generated_code === null;

  // Formatted prefix for display: R · ASM · AA · 66
  const prefixDisplay = prefix
    ? [prefix[0], prefix.slice(1, 4), prefix.slice(4, 6), prefix.slice(6, 8)].join(' · ')
    : null;

  return (
    <div className="grid grid-cols-2 h-full divide-x divide-gray-200">

      {/* ── Col B: Inputs ─────────────────────────────── */}
      <div className="p-4 bg-white">
        <p className="text-[9px] font-bold uppercase tracking-wider text-blue-400 mb-3">Master Code Registry</p>

        {/* Market Category */}
        <div className="mb-3">
          <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1">
            Market Category {state.locked && <span className="text-amber-500 ml-1">🔒 locked</span>}
          </p>
          <div className="flex gap-2">
            {(['R', 'C'] as const).map(cat => (
              <button
                key={cat}
                disabled={state.locked}
                onClick={() => onStateChange({ category: cat, check_status: 'idle', existing_matches: [], unit_conflicts: [], override_confirmed: false, generated_code: null })}
                className={`flex-1 text-[10px] font-semibold py-1 rounded border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  state.category === cat
                    ? cat === 'R'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                }`}
              >
                {cat === 'R' ? '● Residential' : '○ Commercial'}
              </button>
            ))}
          </div>
        </div>

        {/* Entity */}
        <div className="mb-3">
          <label className="text-[9px] text-gray-400 uppercase tracking-wide">Entity (Realtor)</label>
          <select
            value={state.entity_code}
            disabled={state.locked}
            onChange={e => onStateChange({ entity_code: e.target.value, check_status: 'idle', existing_matches: [], unit_conflicts: [], override_confirmed: false, generated_code: null })}
            className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs bg-white focus:outline-none focus:border-blue-400 mt-0.5 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">— Select —</option>
            {entityCodes.map(e => (
              <option key={e.entity_code} value={e.entity_code}>
                {e.entity_code} · {e.company_name}
              </option>
            ))}
          </select>
        </div>

        {/* Agent — dropdown from cr_agents, pre-selected from profile */}
        <div className="mb-3">
          <label className="text-[9px] text-gray-400 uppercase tracking-wide">Agent</label>
          <select
            value={agentCode}
            disabled={state.locked}
            onChange={e => {
              const val = e.target.value;
              onAgentChange(val);
              // Defer state reset so the native select closes cleanly before re-render
              setTimeout(() => onStateChange({ check_status: 'idle', existing_matches: [], unit_conflicts: [], override_confirmed: false, generated_code: null }), 0);
            }}
            className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs bg-white focus:outline-none focus:border-blue-400 mt-0.5 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">— Select agent —</option>
            {agents.map(a => (
              <option key={a.agent_code} value={a.agent_code}>
                {a.full_name}{a.role ? ` · ${a.role}` : ''} · {a.agent_code}
              </option>
            ))}
          </select>
        </div>

        {/* Zone — read-only */}
        <div className="mb-4">
          <label className="text-[9px] text-gray-400 uppercase tracking-wide">Zone</label>
          <div className="flex items-center gap-1 border border-teal-200 bg-teal-50 rounded px-1.5 py-0.5 mt-0.5">
            <span className="font-mono font-bold text-teal-700 text-xs">
              {zoneCode ? String(zoneCode).padStart(2, '0') : '—'}
            </span>
            <span className="text-teal-500 text-xs">from record</span>
          </div>
        </div>

        {/* Metadata fields — auto, read-only display */}
        <div className="border-t border-gray-100 pt-3 space-y-1.5">
          {[
            ['Date', state.date_seg || 'DDMM'],
            ['Time', state.time_seg || 'HHMM'],
            ['Seq',  String(state.seq_num).padStart(4, '0')],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</span>
              <span className={`font-mono text-xs font-semibold ${state.date_seg ? 'text-gray-700' : 'text-gray-300'}`}>{val}</span>
            </div>
          ))}
          <p className="text-[8px] text-gray-300 mt-1">Seq is log-only — excluded from code</p>
        </div>
      </div>

      {/* ── Col C: Preview + Actions ───────────────────── */}
      <div className="p-4 bg-gray-50 flex flex-col">
        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-3">Smart Master Code</p>

        {/* 8-char prefix */}
        <div className="mb-3">
          <p className="text-[9px] text-gray-400 mb-0.5">8-char Prefix</p>
          <p className="font-mono font-bold text-sm tracking-widest text-gray-700">
            {prefixDisplay ?? '————————'}
          </p>
        </div>

        {/* 16-digit generated code */}
        {state.generated_code ? (
          <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded">
            <p className="text-[9px] text-green-600 mb-0.5">Generated</p>
            <p className="font-mono font-bold text-green-800 tracking-wider text-sm break-all">
              {state.generated_code}
            </p>
          </div>
        ) : (
          <div className="mb-3 p-2 bg-gray-100 border border-dashed border-gray-300 rounded">
            <p className="text-[9px] text-gray-400 mb-0.5">16-digit Master Code</p>
            <p className="font-mono text-gray-300 tracking-wider text-sm">
              {prefix && state.date_seg
                ? `${prefix}${state.date_seg}${state.time_seg}`
                : '————————————————'}
            </p>
          </div>
        )}

        {/* Status */}
        <p className="text-[10px] mb-2" style={{ color: statusColor }}>{statusLabel}</p>

        {/* Existing matches */}
        {state.check_status === 'existing' && (
          <div className="mb-3 p-2 bg-amber-50 border border-amber-300 rounded">
            <p className="text-[10px] font-bold text-amber-700 mb-1">EXISTING — Suspected Duplicate</p>
            {state.existing_matches.slice(0, 3).map(m => (
              <div key={m.master_code} className="mb-0.5">
                <p className="font-mono text-[10px] text-amber-700">{m.master_code}</p>
                {m.property_ref && <p className="text-[9px] text-amber-500">{m.property_ref}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto space-y-2">
          {/* Check button — Phase 1 */}
          {prefixOk && state.check_status === 'idle' && !state.locked && (
            <button
              onClick={runCheck}
              className="w-full text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold"
            >Check Registry</button>
          )}
          {state.check_status === 'checking' && (
            <button disabled className="w-full text-xs px-3 py-1.5 bg-blue-300 text-white rounded font-semibold opacity-60">
              Checking…
            </button>
          )}
          {state.check_status === 'existing' && !state.generated_code && (
            <button
              onClick={runCheck}
              className="w-full text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-semibold animate-pulse"
            >⚠ Check Registry — CONFLICT</button>
          )}
          {state.check_status === 'clear' && !state.generated_code && (
            <button
              onClick={runCheck}
              className="w-full text-[10px] text-gray-500 border border-gray-200 rounded py-0.5 hover:bg-gray-100"
            >↻ Re-check</button>
          )}

          {/* Apply button — Phase 2, only shown when clear */}
          <button
            disabled={!canApply}
            onClick={onApply}
            className="w-full text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-30 text-white rounded font-semibold"
          >
            Apply to {recordCount} record{recordCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
