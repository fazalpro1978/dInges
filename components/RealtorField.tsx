'use client';
import React, { useState } from 'react';

export type Realtor = { id: string; name: string; moci_id: string | null; classification?: string | null };

export const REALTOR_CLASSIFICATIONS = [
  'Semi-Government & Master Developer',
  'Elite Private Developer & Conglomerate',
  'Top International & Local Brokerage',
  'Institutional Property Manager',
  'Independent',
] as const;

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
  const [adding, setAdding]               = useState(false);
  const [newName, setNewName]             = useState('');
  const [newClass, setNewClass]           = useState('');
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]         = useState('');

  function pickRealtor(pickedName: string) {
    const match = realtors.find((r) => r.name === pickedName);
    onChange({ name: pickedName, moci: match?.moci_id ?? moci });
  }

  function openAdd() {
    setNewName(''); setNewClass(''); setSaveError(''); setAdding(true);
  }

  async function saveNewRealtor() {
    if (!newName.trim()) { setSaveError('Company name is required.'); return; }
    if (!newClass) { setSaveError('Classification is required.'); return; }
    if (realtors.some(r => r.name.toLowerCase() === newName.trim().toLowerCase())) {
      setSaveError(`"${newName.trim()}" already exists. Select it from the dropdown.`);
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/realtors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), classification: newClass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save realtor');
      onRealtorAdded(data.realtor);
      onChange({ name: data.realtor.name, moci: data.realtor.moci_id ?? '' });
      setAdding(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save realtor');
    } finally {
      setSaving(false);
    }
  }

  const selected = realtors.find(r => r.name === name);

  return (
    <div className="mt-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
      <p className="text-xs font-semibold text-gray-700 mb-2">Realtor</p>

      {/* Main selector */}
      <select
        value={name}
        onChange={(e) => pickRealtor(e.target.value)}
        className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
      >
        <option value="">— Select realtor —</option>
        {realtors.map((r) => (
          <option key={r.id} value={r.name}>{r.name}{r.classification ? ` · ${r.classification}` : ''}</option>
        ))}
      </select>

      {selected?.classification && (
        <p className="text-[11px] text-gray-400 mt-1">{selected.classification}</p>
      )}

      {/* Toggle add */}
      {!adding ? (
        <button onClick={openAdd} className="mt-2 text-xs text-blue-600 underline hover:text-blue-800">
          + Add new realtor
        </button>
      ) : (
        <div className="mt-2 border border-blue-100 rounded-lg bg-blue-50 p-3 space-y-2">
          <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wide">Add New Realtor</p>

          {/* Company Name */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Company Name *</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setSaveError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') saveNewRealtor(); if (e.key === 'Escape') setAdding(false); }}
              placeholder="e.g. Privé Real Estate"
              className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500 placeholder-gray-400"
            />
          </div>

          {/* Classification */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Classification *</label>
            <select
              value={newClass}
              onChange={e => { setNewClass(e.target.value); setSaveError(''); }}
              className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
            >
              <option value="">Select classification…</option>
              {REALTOR_CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {saveError && <p className="text-[11px] text-red-600">{saveError}</p>}

          <div className="flex gap-2">
            <button
              onClick={saveNewRealtor}
              disabled={saving || !newName.trim() || !newClass}
              className="flex-1 text-xs px-2 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold transition-colors"
            >
              {saving ? 'Saving…' : 'Save to Registry'}
            </button>
            <button
              onClick={() => { setAdding(false); setSaveError(''); }}
              className="text-xs px-2 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
