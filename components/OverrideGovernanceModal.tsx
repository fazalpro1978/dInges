'use client';
import React from 'react';

type Props = {
  prefix:        string;
  unitConflicts: string[];
  propertyRef?:  string | null;
  onCancel:      () => void;
  onConfirm:     () => void;
};

export default function OverrideGovernanceModal({ prefix, unitConflicts, propertyRef, onCancel, onConfirm }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl border border-red-200 w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="bg-red-600 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">⛔</span>
            <h2 className="text-white font-bold text-sm">Master Code Conflict — Restricted Action</h2>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm text-gray-700 mb-3">
            Prefix <span className="font-mono font-bold text-red-700">{prefix}</span> was previously executed
            {propertyRef ? ` for ${propertyRef}` : ''}.
          </p>

          {unitConflicts.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                Units already holding this Master Code
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-h-32 overflow-y-auto">
                {unitConflicts.map(sc => (
                  <p key={sc} className="font-mono text-xs font-bold text-red-700 leading-5">{sc}</p>
                ))}
              </div>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            <p className="text-xs text-amber-800">
              Override and update capabilities are restricted exclusively to{' '}
              <strong>Administrators</strong> and <strong>Superusers</strong>.
              Proceeding will overwrite existing unit Smart Codes.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100 font-semibold"
          >Cancel</button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
          >Confirm Override — Administrator</button>
        </div>
      </div>
    </div>
  );
}
