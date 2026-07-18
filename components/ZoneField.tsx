'use client';
import React, { useState } from 'react';

export type ZoneEntry = { zone_code: number; district_name: string; municipality?: string };

// Programmatic display format: "Zone [N] — [District Name]"
export function fmtZone(z: ZoneEntry) {
  return `Zone ${z.zone_code} — ${z.district_name}`;
}

const MUNICIPALITIES = [
  'Al Daayen Municipality',
  'Al Khor and Al Thakhira Municipality',
  'Al Rayyan Municipality',
  'Al Shamal Municipality',
  'Al Wakrah Municipality',
  'Doha Municipality',
  'Umm Slal Municipality',
  'Al Shahaniya Municipality',
];

export default function ZoneField({
  code,
  name,
  zones,
  onChange,
  onZoneAdded,
}: {
  code: string;
  name: string;
  zones: ZoneEntry[];
  onChange: (next: { code: string; name: string }) => void;
  onZoneAdded: (z: ZoneEntry) => void;
}) {
  const [adding, setAdding]             = useState(false);
  const [municipality, setMunicipality] = useState('');
  const [customMuni, setCustomMuni]     = useState('');
  const [newCode, setNewCode]           = useState('');
  const [newName, setNewName]           = useState('');
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');

  const codeNum      = code ? Number(code) : NaN;
  const selectedZone = zones.find(z => z.zone_code === codeNum);

  const effectiveMuni   = municipality === '__new__' ? customMuni.trim() : municipality;
  const newCodeNum      = Number(newCode);
  const canSave         = !!(effectiveMuni && Number.isInteger(newCodeNum) && newCodeNum > 0 && newName.trim());
  const municipalities  = Array.from(new Set(zones.map(z => z.municipality).filter(Boolean))).sort() as string[];

  function handleSelect(val: string) {
    if (!val) { onChange({ code: '', name: '' }); return; }
    const z = zones.find(z => z.zone_code === Number(val));
    if (z) onChange({ code: String(z.zone_code), name: z.district_name });
  }

  function openAddForm() {
    setNewCode('');
    setNewName('');
    setMunicipality('');
    setCustomMuni('');
    setSaveError('');
    setAdding(true);
  }

  async function saveZone() {
    if (!canSave) {
      setSaveError('Municipality, Zone Number, and District Name are all required.');
      return;
    }
    if (zones.some(z => z.zone_code === newCodeNum)) {
      setSaveError(`Zone code ${newCodeNum} is already registered. Choose a different number.`);
      return;
    }
    // Strip any "Zone N -" prefix the user may have typed
    const cleanName = newName.trim().replace(/^zone\s*\d+\s*[-–—]\s*/i, '').trim();
    if (zones.some(z => z.district_name.toLowerCase() === cleanName.toLowerCase())) {
      setSaveError(`"${cleanName}" is already registered under a different zone code.`);
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone_code: newCodeNum, district_name: cleanName, municipality: effectiveMuni }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save zone');
      const saved: ZoneEntry = { zone_code: data.zone.zone_code, district_name: data.zone.district_name, municipality: data.zone.municipality };
      onZoneAdded(saved);
      onChange({ code: String(saved.zone_code), name: saved.district_name });
      setAdding(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save zone');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
      {/* Zone selector dropdown */}
      <div className="flex items-center gap-2">
        <select
          value={code}
          onChange={e => handleSelect(e.target.value)}
          className="flex-1 bg-white border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-teal-500"
        >
          <option value="">— Select zone —</option>
          {zones.map(z => (
            <option key={z.zone_code} value={z.zone_code}>{fmtZone(z)}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => adding ? setAdding(false) : openAddForm()}
          className="text-xs px-2 py-1.5 rounded border border-gray-300 text-teal-700 hover:bg-teal-50 font-semibold whitespace-nowrap"
          title={adding ? 'Cancel add zone' : 'Register a new zone'}
        >
          {adding ? '✕' : '+ Add Zone'}
        </button>
      </div>

      {/* Selected zone display */}
      {selectedZone && (
        <p className="text-[11px] text-teal-700 mt-1 font-medium">{fmtZone(selectedZone)}{selectedZone.municipality ? ` · ${selectedZone.municipality}` : ''}</p>
      )}

      {/* Inline Add Zone form — mirrors Code Registry ZoneInlineAdd */}
      {adding && (
        <div className="mt-2 border border-teal-200 rounded-lg bg-teal-50 p-3 space-y-2.5">
          <p className="text-[11px] font-bold text-teal-800 uppercase tracking-wide">Register New Zone</p>

          {/* Municipality */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-1">Municipality *</label>
            <select
              value={municipality}
              onChange={e => { setMunicipality(e.target.value); setSaveError(''); }}
              className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-teal-500"
            >
              <option value="">Select…</option>
              {municipalities.length > 0 && municipalities.map(m => <option key={m}>{m}</option>)}
              {MUNICIPALITIES.filter(m => !municipalities.includes(m)).map(m => <option key={m}>{m}</option>)}
              <option value="__new__">+ Type new municipality…</option>
            </select>
            {municipality === '__new__' && (
              <input
                autoFocus
                value={customMuni}
                onChange={e => { setCustomMuni(e.target.value); setSaveError(''); }}
                placeholder="Municipality name…"
                className="mt-1 w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-teal-500 placeholder-gray-400"
              />
            )}
          </div>

          {/* Zone Number — user-assigned, no auto-increment */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-1">Zone Number *</label>
            <input
              type="number"
              min={1}
              value={newCode}
              onChange={e => { setNewCode(e.target.value); setSaveError(''); }}
              placeholder="e.g. 61"
              className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-teal-500 placeholder-gray-400"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">Administrator-assigned. Must be unique — not auto-generated.</p>
          </div>

          {/* District / Zone Name */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-1">District / Zone Name *</label>
            <input
              value={newName}
              onChange={e => { setNewName(e.target.value); setSaveError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') saveZone(); if (e.key === 'Escape') setAdding(false); }}
              placeholder="e.g. West Bay, The Pearl…"
              className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-teal-500 placeholder-gray-400"
            />
            {newCode && newName && Number.isInteger(newCodeNum) && newCodeNum > 0 && (
              <p className="text-[10px] text-teal-700 mt-0.5 font-medium">
                Will display as: Zone {newCodeNum} — {newName.trim()}
              </p>
            )}
          </div>

          {saveError && <p className="text-[11px] text-red-600">{saveError}</p>}

          <div className="flex gap-2">
            <button
              onClick={saveZone}
              disabled={saving || !canSave}
              className="flex-1 text-xs px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-semibold transition-colors"
            >
              {saving ? 'Saving…' : 'Save to Registry'}
            </button>
            <button
              onClick={() => { setAdding(false); setSaveError(''); }}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
