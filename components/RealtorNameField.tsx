'use client';
import React, { useState } from 'react';
import type { Realtor } from './RealtorField';

export default function RealtorNameField({
  value,
  realtors,
  onChange,
  onRealtorAdded,
}: {
  value: string;
  realtors: Realtor[];
  onChange: (name: string) => void;
  onRealtorAdded: (r: Realtor) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMoci, setNewMoci] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

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
      onChange(data.realtor.name);
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
    <div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
      >
        <option value="">— Select realtor —</option>
        {realtors.map((r) => (
          <option key={r.id} value={r.name}>{r.name}</option>
        ))}
      </select>

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1 text-[11px] text-blue-600 underline"
        >+ Add new realtor</button>
      ) : (
        <div className="mt-1.5 border-t border-gray-200 pt-1.5 space-y-1.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Realtor name"
            className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
          />
          <input
            value={newMoci}
            onChange={(e) => setNewMoci(e.target.value)}
            placeholder="MOCI ID (optional)"
            className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
          />
          {saveError && <p className="text-[11px] text-red-600">{saveError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveNewRealtor}
              disabled={saving || !newName.trim()}
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
