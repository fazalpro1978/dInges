'use client';
import React, { useState } from 'react';

export type TypeConfig    = { type_code: string; configuration: string; category: string };
export type EntityCode    = { entity_code: string; company_name: string };

export type CRFields = {
  type_code:    string;
  entity_code:  string;
  agent_code:   string;  // pre-filled from user profile — read-only display
  zone_code:    string;  // 2-char padded, pre-filled from record
};

export type CRCardState = {
  fields:          CRFields;
  prefix:          string | null;   // 10-char deterministic prefix
  checkStatus:     'idle' | 'checking' | 'clear' | 'existing';
  existingMatches: ExistingMatch[];
  resolution:      'unresolved' | 'link' | 'overwrite' | 'force_new';
  linkedSmartCode: string | null;
  generatedSmartCode: string | null;
};

export type ExistingMatch = {
  smart_code:    string;
  status:        string;
  building_name: string | null;
  floor_ref:     string | null;
  unit_ref:      string | null;
};

export function buildPrefix(fields: CRFields, typeConfigs: TypeConfig[]): string | null {
  const { type_code, entity_code, agent_code, zone_code } = fields;
  if (!type_code || !entity_code || !agent_code || !zone_code) return null;
  const cfg = typeConfigs.find(t => t.type_code === type_code);
  if (!cfg) return null;
  const zone = String(zone_code).padStart(2, '0').slice(-2);
  return `${cfg.category}${type_code}${entity_code}${agent_code}${zone}`;
}

type Props = {
  rowIndex:         number;
  state:            CRCardState;
  typeConfigs:      TypeConfig[];
  entityCodes:      EntityCode[];
  agentCode:        string;   // logged-in user's agent_code
  agentName:        string;   // logged-in user's full_name
  zoneCodeFromRecord: string; // auto-populated from the matched record
  onStateChange:    (next: Partial<CRCardState>) => void;
  onInspect:        () => void;
  onAddTypeConfig:  (cfg: TypeConfig) => void;
};

export default function CodeRegistryPanel({
  rowIndex, state, typeConfigs, entityCodes, agentCode, agentName, zoneCodeFromRecord,
  onStateChange, onInspect, onAddTypeConfig,
}: Props) {
  const [addTypeOpen, setAddTypeOpen] = useState(false);
  const [newType, setNewType] = useState({ type_code: '', core_type: '', configuration: '', category: 'R' });
  const [addTypeErr, setAddTypeErr] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const setField = (key: keyof CRFields, val: string) => {
    const next = { ...state.fields, [key]: val };
    const prefix = buildPrefix({ ...next, agent_code: agentCode, zone_code: zoneCodeFromRecord }, typeConfigs);
    onStateChange({ fields: next, prefix, checkStatus: 'idle', existingMatches: [] });
  };

  const runCheck = async () => {
    if (!state.prefix) return;
    onStateChange({ checkStatus: 'checking' });
    try {
      const token = (await import('../lib/supabaseClient')).default.auth.getSession().then(r => r.data.session?.access_token ?? '');
      const res = await fetch(`/api/code-registry/check?prefix=${state.prefix}`, {
        headers: { Authorization: `Bearer ${await token}` },
      });
      const data = await res.json();
      onStateChange({
        checkStatus:     data.hasConflict ? 'existing' : 'clear',
        existingMatches: data.matches ?? [],
      });
    } catch {
      onStateChange({ checkStatus: 'idle' });
    }
  };

  const handleAddType = async () => {
    setAddTypeErr('');
    if (!newType.type_code.trim() || newType.type_code.trim().length !== 2) { setAddTypeErr('Type code must be 2 characters'); return; }
    if (!newType.core_type.trim()) { setAddTypeErr('Core Type is required (e.g. Apartment, Villa)'); return; }
    if (!newType.configuration.trim()) { setAddTypeErr('Label is required'); return; }
    setIsAdding(true);
    try {
      const token = await (await import('../lib/supabaseClient')).default.auth.getSession().then(r => r.data.session?.access_token ?? '');
      const res = await fetch('/api/code-registry/type-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type_code: newType.type_code, core_type: newType.core_type, configuration: newType.configuration, category: newType.category }),
      });
      const d = await res.json();
      if (!res.ok) { setAddTypeErr(d.error ?? 'Failed'); return; }
      onAddTypeConfig(d.typeConfig as TypeConfig);
      setNewType({ type_code: '', core_type: '', configuration: '', category: 'R' });
      setAddTypeOpen(false);
    } finally {
      setIsAdding(false);
    }
  };

  const cfg = typeConfigs.find(t => t.type_code === state.fields.type_code);
  const prefixOk = state.prefix !== null;

  const statusColor = {
    idle:     '#6b7280',
    checking: '#3b82f6',
    clear:    '#16a34a',
    existing: '#d97706',
  }[state.checkStatus];

  const statusLabel = {
    idle:     state.prefix ? '⬤ Prefix ready — run check' : '◯ Fill all fields',
    checking: '⟳ Checking registry…',
    clear:    '✓ No conflicts — ready to generate',
    existing: `⚠ ${state.existingMatches.length} existing code${state.existingMatches.length > 1 ? 's' : ''} found`,
  }[state.checkStatus];

  return (
    <div className="grid grid-cols-3 gap-0 border border-gray-200 rounded-lg overflow-hidden text-xs mt-2">

      {/* ── Panel 1: Record Summary ─────────────── */}
      <div className="p-3 bg-gray-50 border-r border-gray-200">
        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-2">Record Data</p>

        {/* Realtor + Zone compact read display — already set in bulk section above */}
        <div className="space-y-1">
          {[
            ['Type', 'type'], ['Config', 'config'], ['Furnishing', 'furnishing'],
            ['Status', 'status'], ['Rent (QAR)', 'rent'],
          ].map(([label]) => (
            <div key={label} className="flex justify-between gap-1">
              <span className="text-gray-400 shrink-0">{label}</span>
              <span className="text-gray-600 font-medium truncate text-right">—</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Panel 2: Code Registry Inputs ────────── */}
      <div className="p-3 bg-white border-r border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] font-bold uppercase tracking-wider text-blue-400">Code Registry</p>
          <button
            onClick={() => setAddTypeOpen(v => !v)}
            title="Add new property type"
            className="text-[10px] text-blue-500 hover:text-blue-700 font-semibold"
          >+ Type</button>
        </div>

        {addTypeOpen && (
          <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded">
            <p className="text-[9px] font-bold text-blue-700 mb-1.5">New Property Type</p>
            <input placeholder="Code (2 chars)" maxLength={2} value={newType.type_code}
              onChange={e => setNewType(p => ({ ...p, type_code: e.target.value.toUpperCase() }))}
              className="w-full border border-blue-200 rounded px-1.5 py-0.5 text-xs mb-1 focus:outline-none focus:border-blue-400"
            />
            <input placeholder="Core Type (e.g. Apartment, Villa)" value={newType.core_type}
              onChange={e => setNewType(p => ({ ...p, core_type: e.target.value }))}
              className="w-full border border-blue-200 rounded px-1.5 py-0.5 text-xs mb-1 focus:outline-none focus:border-blue-400"
            />
            <input placeholder="Label / Config (e.g. Master — Villa)" value={newType.configuration}
              onChange={e => setNewType(p => ({ ...p, configuration: e.target.value }))}
              className="w-full border border-blue-200 rounded px-1.5 py-0.5 text-xs mb-1 focus:outline-none focus:border-blue-400"
            />
            <select value={newType.category} onChange={e => setNewType(p => ({ ...p, category: e.target.value }))}
              className="w-full border border-blue-200 rounded px-1.5 py-0.5 text-xs mb-1 bg-white focus:outline-none"
            >
              <option value="R">Residential</option>
              <option value="C">Commercial</option>
            </select>
            {addTypeErr && <p className="text-red-500 text-[10px] mb-1">{addTypeErr}</p>}
            <div className="flex gap-1">
              <button onClick={handleAddType} disabled={isAdding}
                className="flex-1 text-[10px] bg-blue-600 hover:bg-blue-700 text-white rounded py-0.5 disabled:opacity-40"
              >{isAdding ? '…' : 'Add'}</button>
              <button onClick={() => setAddTypeOpen(false)}
                className="flex-1 text-[10px] border border-gray-300 text-gray-600 rounded py-0.5 hover:bg-gray-50"
              >Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {/* Type Code */}
          <div>
            <label className="text-[9px] text-gray-400 uppercase tracking-wide">Property Config</label>
            <select
              value={state.fields.type_code}
              onChange={e => setField('type_code', e.target.value)}
              className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs bg-white focus:outline-none focus:border-blue-400"
            >
              <option value="">— Select —</option>
              {typeConfigs.map(t => (
                <option key={t.type_code} value={t.type_code}>
                  {t.type_code} · {t.configuration}
                </option>
              ))}
            </select>
          </div>

          {/* Entity Code */}
          <div>
            <label className="text-[9px] text-gray-400 uppercase tracking-wide">Entity</label>
            <select
              value={state.fields.entity_code}
              onChange={e => setField('entity_code', e.target.value)}
              className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs bg-white focus:outline-none focus:border-blue-400"
            >
              <option value="">— Select —</option>
              {entityCodes.map(e => (
                <option key={e.entity_code} value={e.entity_code}>
                  {e.entity_code} · {e.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* Agent Code — pre-filled, read-only */}
          <div>
            <label className="text-[9px] text-gray-400 uppercase tracking-wide">Assigned To</label>
            <div className="flex items-center gap-1 border border-blue-200 bg-blue-50 rounded px-1.5 py-0.5">
              <span className="font-mono font-bold text-blue-700">{agentCode || '—'}</span>
              <span className="text-blue-500 truncate">{agentName || 'pre-filled from profile'}</span>
            </div>
          </div>

          {/* Zone Code — pre-filled from record */}
          <div>
            <label className="text-[9px] text-gray-400 uppercase tracking-wide">Zone Code</label>
            <div className="flex items-center gap-1 border border-teal-200 bg-teal-50 rounded px-1.5 py-0.5">
              <span className="font-mono font-bold text-teal-700">{zoneCodeFromRecord ? String(zoneCodeFromRecord).padStart(2, '0') : '—'}</span>
              <span className="text-teal-500">from record</span>
            </div>
          </div>

          {/* Category — derived */}
          {cfg && (
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-400 uppercase tracking-wide">Market Category</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cfg.category === 'R' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                {cfg.category === 'R' ? 'Residential' : 'Commercial'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Panel 3: Code Preview + Status ───────── */}
      <div className="p-3 bg-gray-50">
        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-2">Smart Code</p>

        {/* Prefix display */}
        <div className="mb-2">
          <p className="text-[9px] text-gray-400 mb-0.5">10-char Prefix</p>
          <p className="font-mono font-bold text-sm tracking-widest text-gray-700">
            {state.prefix ?? '——————————'}
          </p>
        </div>

        {/* Generated code (post-gate) */}
        {state.generatedSmartCode && (
          <div className="mb-2 p-1.5 bg-green-50 border border-green-200 rounded">
            <p className="text-[9px] text-green-600 mb-0.5">Generated</p>
            <p className="font-mono font-bold text-green-800 tracking-wider">{state.generatedSmartCode}</p>
          </div>
        )}

        {/* Status + check button */}
        <div className="mb-2">
          <p className="text-[10px] mb-1" style={{ color: statusColor }}>{statusLabel}</p>
          {prefixOk && state.checkStatus === 'idle' && (
            <button
              onClick={runCheck}
              className="text-[10px] px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >Check Registry</button>
          )}
        </div>

        {/* EXISTING badge + inspect button */}
        {state.checkStatus === 'existing' && (
          <div className="p-1.5 bg-amber-50 border border-amber-300 rounded mb-2">
            <p className="text-[10px] font-bold text-amber-700 mb-1">EXISTING — Suspected Duplicate</p>
            {state.existingMatches.slice(0, 2).map(m => (
              <p key={m.smart_code} className="font-mono text-[10px] text-amber-600">{m.smart_code}</p>
            ))}
            <button
              onClick={onInspect}
              className="mt-1 text-[10px] text-blue-600 underline hover:no-underline"
            >→ Inspect side-by-side</button>
          </div>
        )}

        {/* Resolution badge once decided */}
        {state.resolution !== 'unresolved' && (
          <div className={`text-[10px] font-bold px-2 py-0.5 rounded ${
            state.resolution === 'link'       ? 'bg-green-100 text-green-700' :
            state.resolution === 'overwrite'  ? 'bg-blue-100 text-blue-700' :
            'bg-red-100 text-red-700'
          }`}>
            {state.resolution === 'link'      ? '✓ Linked to existing'  :
             state.resolution === 'overwrite' ? '↑ Will overwrite'       :
             '+ Force create new'}
          </div>
        )}
      </div>
    </div>
  );
}
