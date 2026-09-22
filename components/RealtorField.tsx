'use client';
import React, { useState, useRef, useEffect } from 'react';

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
  const [open, setOpen]               = useState(false);
  const [search, setSearch]           = useState('');
  const [adding, setAdding]           = useState(false);
  const [newName, setNewName]         = useState('');
  const [newClass, setNewClass]       = useState('');
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef    = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const filtered = realtors.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  function pickRealtor(r: Realtor) {
    onChange({ name: r.name, moci: r.moci_id ?? moci });
    setOpen(false);
    setSearch('');
  }

  function clearSelection() {
    onChange({ name: '', moci: '' });
    setOpen(false);
    setSearch('');
  }

  function openAdd() {
    setNewName(''); setNewClass(''); setSaveError(''); setAdding(true); setOpen(false); setSearch('');
  }

  async function saveNewRealtor() {
    if (!newName.trim()) { setSaveError('Company name is required.'); return; }
    if (!newClass) { setSaveError('Classification is required.'); return; }
    if (realtors.some(r => r.name.toLowerCase() === newName.trim().toLowerCase())) {
      setSaveError(`"${newName.trim()}" already exists. Select it from the dropdown.`);
      return;
    }
    setSaving(true); setSaveError('');
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
    <div className="mt-2 border border-gray-200 rounded-lg p-3 bg-gray-50" ref={containerRef}>
      <p className="text-xs font-semibold text-gray-700 mb-2">Realtor</p>

      {/* Combobox trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setOpen(o => !o); setSearch(''); }}
          className="w-full flex items-center justify-between bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500 hover:border-blue-400 transition-colors text-left"
        >
          <span className={name ? 'text-gray-800' : 'text-gray-400'}>
            {name || '— Select realtor —'}
          </span>
          <span className="text-gray-400 ml-2">{open ? '▲' : '▼'}</span>
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            {/* Search input */}
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded px-2 py-1">
                <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 16 16">
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setOpen(false); setSearch(''); }
                    if (e.key === 'Enter' && filtered.length === 1) pickRealtor(filtered[0]);
                  }}
                  placeholder="Search realtors…"
                  className="flex-1 bg-transparent text-xs text-gray-800 placeholder-gray-400 focus:outline-none min-w-0"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600 text-xs leading-none">✕</button>
                )}
              </div>
            </div>

            {/* Options list */}
            <div className="max-h-48 overflow-y-auto">
              {/* Clear option */}
              {name && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 border-b border-gray-100 italic"
                >
                  — Clear selection —
                </button>
              )}

              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400 italic">No realtors match &ldquo;{search}&rdquo;</p>
              ) : (
                filtered.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pickRealtor(r)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors ${
                      r.name === name ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-800'
                    }`}
                  >
                    <span className="font-medium">{r.name}</span>
                    {r.classification && (
                      <span className="block text-[10px] text-gray-400 mt-0.5">{r.classification}</span>
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Add new */}
            <div className="border-t border-gray-100 p-2">
              <button
                type="button"
                onClick={openAdd}
                className="w-full text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-1.5 text-left transition-colors font-medium"
              >
                + Add new realtor
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Selected classification hint */}
      {selected?.classification && !open && (
        <p className="text-[11px] text-gray-400 mt-1">{selected.classification}</p>
      )}

      {/* Add new realtor inline form */}
      {!open && !adding && (
        <button onClick={openAdd} className="mt-2 text-xs text-blue-600 underline hover:text-blue-800">
          + Add new realtor
        </button>
      )}

      {adding && (
        <div className="mt-2 border border-blue-100 rounded-lg bg-blue-50 p-3 space-y-2">
          <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wide">Add New Realtor</p>

          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Company Name *</label>
            <input
              autoFocus
              value={newName}
              onChange={e => { setNewName(e.target.value); setSaveError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') saveNewRealtor(); if (e.key === 'Escape') setAdding(false); }}
              placeholder="e.g. Privé Real Estate"
              className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500 placeholder-gray-400"
            />
          </div>

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
