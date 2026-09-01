'use client';
import React, { useState } from 'react';

export type OverrideResult = { selectedUnits: string[]; reason: string };

type Props = {
  prefix:        string;
  unitConflicts: string[];
  propertyRef?:  string | null;
  onCancel:      () => void;
  onConfirm:     (result: OverrideResult) => void;
};

export default function OverrideGovernanceModal({ prefix, unitConflicts, propertyRef, onCancel, onConfirm }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason]     = useState('');

  const allSelected = selected.size === unitConflicts.length && unitConflicts.length > 0;
  const isBulk      = selected.size === unitConflicts.length;
  const canSubmit   = selected.size > 0 && reason.trim().length >= 10;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(unitConflicts));
  }
  function toggleUnit(sc: string) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(sc) ? n.delete(sc) : n.add(sc);
      return n;
    });
  }

  function handleConfirm() {
    if (!canSubmit) return;
    onConfirm({ selectedUnits: Array.from(selected), reason: reason.trim() });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl border border-red-200 w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="bg-red-600 px-5 py-4 flex items-center gap-2">
          <span className="text-xl">⛔</span>
          <h2 className="text-white font-bold text-sm">Master Code Conflict — Restricted Action</h2>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-700">
            Prefix <span className="font-mono font-bold text-red-700">{prefix}</span> was previously executed
            {propertyRef ? ` for ${propertyRef}` : ''}.
          </p>

          {/* Unit list with checkboxes */}
          {unitConflicts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Units Already Holding This Master Code
                </p>
                <button
                  onClick={toggleAll}
                  className="text-[10px] font-semibold text-blue-600 hover:text-blue-800"
                >
                  {allSelected ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-h-44 overflow-y-auto space-y-1">
                {unitConflicts.map(sc => (
                  <label key={sc} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selected.has(sc)}
                      onChange={() => toggleUnit(sc)}
                      className="w-3.5 h-3.5 accent-red-600 cursor-pointer"
                    />
                    <span className="font-mono text-xs font-bold text-red-700 group-hover:text-red-900 leading-5">
                      {sc}
                    </span>
                  </label>
                ))}
              </div>

              {/* Selection count + partial warning */}
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-gray-500">
                  {selected.size} of {unitConflicts.length} selected for override
                </span>
                {selected.size > 0 && !isBulk && (
                  <span className="text-[10px] text-amber-600 font-semibold">
                    {unitConflicts.length - selected.size} unit{unitConflicts.length - selected.size !== 1 ? 's' : ''} will be skipped
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Reason textarea */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
              Override Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain why this override is necessary (min 10 characters)…"
              rows={3}
              className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-400 resize-none placeholder:text-gray-300"
            />
            {reason.length > 0 && reason.trim().length < 10 && (
              <p className="text-[10px] text-red-500 mt-0.5">Minimum 10 characters required</p>
            )}
          </div>

          {/* Admin restriction notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-xs text-amber-800">
              Override capabilities are restricted to <strong>Administrators</strong> and{' '}
              <strong>Superusers</strong>. Selected units will have their Smart Codes overwritten.
              This action is audit-logged.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100 font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg font-semibold"
          >
            {isBulk
              ? 'Confirm Bulk Override'
              : `Confirm Override — ${selected.size} unit${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
