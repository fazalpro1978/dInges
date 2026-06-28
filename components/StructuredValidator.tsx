'use client';
import React, { useEffect, useState } from 'react';
import {
  MASTER_FIELDS, BATCH_FIELDS, castAndValidateField, slugifyProperty, toIngestRecord,
} from '@/lib/importSchema';
import { StageIndicator, FieldCell } from './StructuredImportShared';
import type { MappedPayload } from './StructuredMapper';

const ALL_FIELDS = [...MASTER_FIELDS, ...BATCH_FIELDS];

const DISPLAY_COLS = [
  'unit_code', 'realtor_moci', 'property', 'unit_no', 'zone_code', 'zone',
  'type', 'config', 'furnishing', 'rent', 'status',
  'bathrooms', 'kitchen', 'realtor_name',
] as const;

type ValidatedRow = {
  raw: Record<string, string>;
  cast: Record<string, unknown>;
  zone: string | null;
  unit_code: string | null;
  errors: string[];
};

function computeRow(raw: Record<string, string>, zoneMap: Map<number, string>): ValidatedRow {
  const cast: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const f of ALL_FIELDS) {
    const { value, error } = castAndValidateField(f, raw[f.key] ?? '');
    cast[f.key] = value;
    if (error) errors.push(error);
  }

  let zone: string | null = null;
  if (cast.zone_code != null) {
    const z = zoneMap.get(cast.zone_code as number);
    if (z) zone = z;
    else errors.push(`Unknown zone code: ${cast.zone_code}`);
  }

  let unit_code: string | null = null;
  if (cast.property && cast.unit_no) {
    unit_code = `${slugifyProperty(String(cast.property))}-${cast.unit_no}`;
  }

  return { raw, cast, zone, unit_code, errors };
}

export default function StructuredValidator({ payload, onValidated }: {
  payload: MappedPayload;
  onValidated: (records: Record<string, unknown>[]) => void;
}) {
  const [phase, setPhase] = useState<'validating' | 'review'>('validating');
  const [rows, setRows] = useState<ValidatedRow[]>([]);
  const [zoneMap, setZoneMap] = useState<Map<number, string>>(new Map());
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const zRes = await fetch('/api/zones');
        const zData = await zRes.json();
        const zMap = new Map<number, string>(
          (zData.zones ?? []).map((z: { zone_code: number; district_name: string }) => [z.zone_code, z.district_name]),
        );
        setZoneMap(zMap);

        const initialRows = payload.rows.map((row) => {
          const raw: Record<string, string> = {};
          for (const f of MASTER_FIELDS) {
            const sourceCol = payload.mapping[f.key];
            raw[f.key] = sourceCol ? String(row[sourceCol] ?? '') : '';
          }
          for (const f of BATCH_FIELDS) {
            raw[f.key] = payload.batch[f.key] ?? '';
          }
          return computeRow(raw, zMap);
        });

        setRows(initialRows);
        setPhase('review');
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Validation failed to initialize');
      }
    })();
  }, [payload]);

  function updateCell(idx: number, key: string, value: string) {
    setRows((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const raw = { ...r.raw, [key]: value };
      return computeRow(raw, zoneMap);
    }));
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function proceed() {
    const validRows = rows.filter((r) => r.errors.length === 0);
    const records = validRows.map((r) => toIngestRecord({ ...r.cast, zone: r.zone, unit_code: r.unit_code }));
    onValidated(records);
  }

  const errorCount = rows.filter((r) => r.errors.length > 0).length;
  const validCount = rows.filter((r) => r.errors.length === 0).length;

  if (loadError) {
    return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>;
  }

  if (phase === 'validating') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Running deterministic validation…</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <StageIndicator current={1} steps={['Mapping', 'Validation', 'Match & Review']} />
        <button
          onClick={proceed}
          disabled={validCount === 0}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Proceed to Match — {validCount} Records →
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Ready',              count: validCount, color: '#22c55e' },
          { label: 'Errors (blocked)',   count: errorCount, color: '#ef4444' },
          { label: 'Total Rows',         count: rows.length, color: '#3b82f6' },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.count}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="w-8 px-3 py-2.5 text-gray-400">#</th>
                <th className="w-20 px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">Status</th>
                {DISPLAY_COLS.map((k) => (
                  <th key={k} className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">
                    {k.replace(/_/g, ' ')}
                  </th>
                ))}
                <th className="w-16 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const hasError = r.errors.length > 0;
                return (
                  <tr key={i} className={`border-b border-gray-100 group ${hasError ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-2 text-gray-400 text-center">{i + 1}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {hasError ? (
                        <span className="text-[9px] font-bold text-red-600 bg-red-100 border border-red-200 rounded-full px-1.5 py-0.5">Error</span>
                      ) : (
                        <span className="text-[9px] font-bold text-green-600 bg-green-100 border border-green-200 rounded-full px-1.5 py-0.5">Ready</span>
                      )}
                    </td>
                    {DISPLAY_COLS.map((k) => {
                      const derived = k === 'unit_code' || k === 'zone';
                      const value = derived ? (k === 'unit_code' ? r.unit_code : r.zone) : r.cast[k];
                      return (
                        <td key={k} className="px-2 py-2 max-w-[140px]">
                          {editingIdx === i && !derived ? (
                            <input
                              className="w-full bg-white border border-gray-300 rounded px-1.5 py-0.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
                              value={r.raw[k] ?? ''}
                              onChange={(e) => updateCell(i, k, e.target.value)}
                            />
                          ) : (
                            <FieldCell value={value} />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingIdx(editingIdx === i ? null : i)}
                          className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title={editingIdx === i ? 'Done' : 'Edit'}
                        >
                          {editingIdx === i ? '✓' : '✎'}
                        </button>
                        <button
                          onClick={() => removeRow(i)}
                          className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {errorCount > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-1.5">
          <p className="text-xs font-bold text-red-700 mb-2">Rows with errors (blocked until fixed):</p>
          {rows.filter((r) => r.errors.length > 0).map((r, i) => (
            <p key={i} className="text-xs text-gray-600">
              <span className="text-gray-900 font-mono">{r.unit_code ?? `Row ${i + 1}`}</span>
              {' — '}{r.errors.join(' · ')}
            </p>
          ))}
        </div>
      )}

      {errorCount === 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          All {validCount} records passed validation. Ready to match against REIMS.
        </div>
      )}
    </div>
  );
}
