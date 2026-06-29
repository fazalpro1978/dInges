'use client';
import React, { useState } from 'react';

export type Zone = { zone_code: number; district_name: string; municipality: string };

export default function ZoneField({
  value,
  zones,
  onChange,
  onZoneAdded,
}: {
  value: string;
  zones: Zone[];
  onChange: (zoneCode: string) => void;
  onZoneAdded: (z: Zone) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newDistrict, setNewDistrict] = useState('');
  const [newMunicipality, setNewMunicipality] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function saveNewZone() {
    if (!newCode.trim() || !newDistrict.trim() || !newMunicipality.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone_code: Number(newCode.trim()),
          district_name: newDistrict.trim(),
          municipality: newMunicipality.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save zone');
      onZoneAdded(data.zone);
      onChange(String(data.zone.zone_code));
      setAdding(false);
      setNewCode('');
      setNewDistrict('');
      setNewMunicipality('');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save zone');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
      >
        <option value="">— Select zone —</option>
        {zones.map((z) => (
          <option key={z.zone_code} value={z.zone_code}>{z.zone_code} — {z.district_name}</option>
        ))}
      </select>

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1 text-[11px] text-blue-600 underline"
        >+ Add new zone</button>
      ) : (
        <div className="mt-1.5 border-t border-gray-200 pt-1.5 space-y-1.5">
          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Zone code (number)"
            className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
          />
          <input
            value={newDistrict}
            onChange={(e) => setNewDistrict(e.target.value)}
            placeholder="District / area name"
            className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
          />
          <input
            value={newMunicipality}
            onChange={(e) => setNewMunicipality(e.target.value)}
            placeholder="Municipality"
            className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
          />
          {saveError && <p className="text-[11px] text-red-600">{saveError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveNewZone}
              disabled={saving || !newCode.trim() || !newDistrict.trim() || !newMunicipality.trim()}
              className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold"
            >{saving ? 'Saving…' : 'Save'}</button>
            <button
              type="button"
              onClick={() => { setAdding(false); setSaveError(''); }}
              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
            >Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
