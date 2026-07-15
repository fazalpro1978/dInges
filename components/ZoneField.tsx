'use client';
import React, { useState } from 'react';

export type ZoneEntry = { zone_code: number; district_name: string };

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
  const [adding, setAdding] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const codeNum = code ? Number(code) : NaN;
  const inRegistry = !isNaN(codeNum) && zones.some(z => z.zone_code === codeNum);
  const showSavePrompt = code.trim() !== '' && !isNaN(codeNum) && !inRegistry;

  function handleCodeChange(val: string) {
    const match = zones.find(z => z.zone_code === Number(val));
    onChange({ code: val, name: match ? match.district_name : name });
  }

  function openAddForm() {
    setNewCode(code);
    setNewName(name);
    setSaveError('');
    setAdding(true);
  }

  async function saveZone() {
    const parsed = Number(newCode);
    if (!Number.isInteger(parsed) || parsed <= 0 || !newName.trim()) {
      setSaveError('Zone code (positive number) and zone name are required.');
      return;
    }
    if (zones.some(z => z.zone_code === parsed)) {
      setSaveError(`Zone code ${parsed} already exists in the registry.`);
      return;
    }
    if (zones.some(z => z.district_name.toLowerCase() === newName.trim().toLowerCase())) {
      setSaveError(`Zone name "${newName.trim()}" already exists in the registry.`);
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone_code: parsed, district_name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save zone');
      const saved: ZoneEntry = { zone_code: data.zone.zone_code, district_name: data.zone.district_name };
      onZoneAdded(saved);
      onChange({ code: String(saved.zone_code), name: saved.district_name });
      setAdding(false);
      setNewCode('');
      setNewName('');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save zone');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
      <p className="text-xs font-semibold text-gray-700 mb-2">Zone</p>
      <div className="flex gap-2">
        <input
          type="number"
          value={code}
          onChange={e => handleCodeChange(e.target.value)}
          placeholder="Zone code"
          className="w-28 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-teal-500"
        />
        <input
          type="text"
          value={name}
          onChange={e => onChange({ code, name: e.target.value })}
          placeholder="Zone name (auto-filled)"
          className="flex-1 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-teal-500"
        />
      </div>

      {showSavePrompt && !adding && (
        <button
          onClick={openAddForm}
          className="mt-2 text-xs text-teal-700 underline underline-offset-2 hover:text-teal-900"
        >
          + Save zone {code} to registry
        </button>
      )}

      {adding && (
        <div className="mt-2 border-t border-gray-200 pt-2 space-y-1.5">
          <p className="text-[11px] text-gray-500">
            Save to the shared registry so it auto-fills on future uploads.
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              value={newCode}
              onChange={e => setNewCode(e.target.value)}
              placeholder="Zone code"
              className="w-28 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-teal-500"
            />
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Zone name"
              className="flex-1 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-teal-500"
            />
          </div>
          {saveError && <p className="text-[11px] text-red-600">{saveError}</p>}
          <div className="flex gap-2">
            <button
              onClick={saveZone}
              disabled={saving || !newCode.trim() || !newName.trim()}
              className="text-xs px-2 py-1 rounded bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-semibold"
            >
              {saving ? 'Saving…' : 'Save to Registry'}
            </button>
            <button
              onClick={() => { setAdding(false); setSaveError(''); }}
              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
