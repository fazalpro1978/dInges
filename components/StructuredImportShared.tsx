'use client';
import React from 'react';

export function StageIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const done   = current > i;
        const active = current === i;
        return (
          <React.Fragment key={label}>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
              done   ? 'text-green-600' :
              active ? 'text-blue-700 bg-blue-100' :
                       'text-gray-400'
            }`}>
              {done ? (
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] shrink-0 ${
                  active ? 'border-blue-600 text-blue-700' : 'border-gray-300 text-gray-400'
                }`}>{i + 1}</span>
              )}
              {label}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-6 h-px shrink-0 ${current > i ? 'bg-green-300' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function FieldCell({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-300 italic text-[10px]">—</span>;
  }
  return <span className="text-xs text-gray-700">{String(value)}</span>;
}

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ background: color }} className="text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
      {label}
    </span>
  );
}

export function actionBadge(action: string) {
  if (action === 'new')      return <Badge label="NEW" color="#22c55e" />;
  if (action === 'update')   return <Badge label="UPDATE" color="#3b82f6" />;
  if (action === 'conflict') return <Badge label="CONFLICT" color="#a855f7" />;
  return <Badge label="UNRESOLVED" color="#f59e0b" />;
}

export function statusBadge(status: string) {
  if (status === 'approved') return <Badge label="APPROVED" color="#22c55e" />;
  if (status === 'rejected') return <Badge label="REJECTED" color="#ef4444" />;
  return <Badge label="PENDING" color="#6b7280" />;
}
