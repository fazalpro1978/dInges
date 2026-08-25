'use client';
import React, { useState } from 'react';

const REASON_CODES = [
  { code: 'CONFIG_MISMATCH',    label: 'Config Mismatch' },
  { code: 'ENTITY_MISMATCH',   label: 'Entity Mismatch' },
  { code: 'ZONE_MISMATCH',     label: 'Zone Mismatch' },
  { code: 'AGENT_MISMATCH',    label: 'Agent Mismatch' },
  { code: 'DUPLICATE_OVERRIDE',label: 'Duplicate Override' },
  { code: 'RE_UPLOAD_UPDATE',  label: 'Re-upload / Update' },
  { code: 'SOURCE_ERROR',      label: 'Source Error' },
  { code: 'SYSTEM_ERROR',      label: 'System Error' },
  { code: 'OTHER',             label: 'Other' },
];

type Props = {
  fieldChanged: string;
  valueBefore:  string;
  valueAfter:   string;
  onConfirm:    (reasonCode: string, reasonText: string) => void;
  onCancel:     () => void;
};

// Strict override modal — fires on every post-generation code edit in Stage 2.
// User cannot dismiss without selecting a reason code; edit is blocked until confirmed.
export default function OverrideModal({ fieldChanged, valueBefore, valueAfter, onConfirm, onCancel }: Props) {
  const [reasonCode, setReasonCode] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!reasonCode) return;
    setSaving(true);
    try {
      await onConfirm(reasonCode, reasonText);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md mx-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-900">Override Requires Explanation</p>
          <p className="text-xs text-gray-500 mt-0.5">All post-generation edits are logged to the audit trail.</p>
        </div>

        <div className="px-5 py-4">
          <div className="mb-3 p-2 bg-gray-50 rounded border border-gray-200 text-xs font-mono">
            <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1">Field Changed: {fieldChanged}</p>
            <div className="flex items-center gap-2">
              <span className="text-red-600 line-through">{valueBefore || '—'}</span>
              <span className="text-gray-400">→</span>
              <span className="text-green-700 font-bold">{valueAfter || '—'}</span>
            </div>
          </div>

          <div className="mb-3">
            <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">Reason Code *</label>
            <div className="grid grid-cols-3 gap-1.5">
              {REASON_CODES.map(r => (
                <button
                  key={r.code}
                  onClick={() => setReasonCode(r.code)}
                  className={`text-[10px] px-2 py-1.5 rounded border text-left leading-tight transition-colors ${
                    reasonCode === r.code
                      ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                      : 'border-gray-300 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">Additional Context</label>
            <textarea
              rows={2}
              value={reasonText}
              onChange={e => setReasonText(e.target.value)}
              placeholder="Describe why this change is necessary…"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs resize-none focus:outline-none focus:border-blue-400"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
            >Cancel edit</button>
            <button
              disabled={!reasonCode || saving}
              onClick={handleConfirm}
              className="flex-1 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40"
            >{saving ? 'Saving…' : 'Confirm Override'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
