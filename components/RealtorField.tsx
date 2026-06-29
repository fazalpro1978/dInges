'use client';
import React, { useState } from 'react';

export type Realtor = { id: string; name: string; moci_id: string | null };

export default function RealtorField({
  name,
  moci,
  realtors,
  onChange,
  onRealtorAdded,
}: {
  name: string;
  moci: string;
  realtors: Realtor[];
  onChange: (next: { name: string; moci: string }) => void;
  onRealtorAdded: (r: Realtor) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMoci, setNewMoci] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function pickRealtor(pickedName: string) {
    const match = realtors.find((r) => r.name === pickedName);
    onChange({ name: pickedName, moci: match?.moci_id ?? moci });
  }

  async function saveNewRealtor() {
    if (!newName.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/realtors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), moci_id: newMoci.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save realtor');
      onRealtorAdded(data.realtor);
      onChange({ name: data.realtor.name, moci: data.realtor.moci_id ?? '' });
      setAdding(false);
      setNewName('');
      setNewMoci('');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save realtor');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
      <p className="text-xs font-semibold text-gray-700 mb-2">Realtor</p>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={name}
          onChange={(e) => pickRealtor(e.target.value)}
          className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
        >
          <option value="">— Select realtor —</option>
          {realtors.map((r) => (
            <option key={r.id} value={r.name}>{r.name}</option>
          ))}
        </select>
        <input
          value={moci}
          onChange={(e) => onChange({ name, moci: e.target.value })}
          placeholder="MOCI ID"
          className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
        />
      </div>

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 text-xs text-blue-600 underline"
        >+ Add new realtor</button>
      ) : (
        <div className="mt-2 border-t border-gray-200 pt-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Realtor name"
              className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
            />
            <input
              value={newMoci}
              onChange={(e) => setNewMoci(e.target.value)}
              placeholder="MOCI ID"
              className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
            />
          </div>
          {saveError && <p className="text-[11px] text-red-600">{saveError}</p>}
          <div className="flex gap-2">
            <button
              onClick={saveNewRealtor}
              disabled={saving || !newName.trim()}
              className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold"
            >{saving ? 'Saving…' : 'Save'}</button>
            <button
              onClick={() => { setAdding(false); setSaveError(''); }}
              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
            >Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
