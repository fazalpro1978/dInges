'use client';
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { MASTER_FIELDS, BATCH_FIELDS, suggestMapping } from '@/lib/importSchema';
import RealtorNameField from './RealtorNameField';
import type { Realtor } from './RealtorField';
import ZoneField from './ZoneField';
import type { ZoneEntry } from './ZoneField';

export type MappedPayload = {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  mapping: Record<string, string | null>;
  batch: Record<string, string>;
};

function sheetTo2D(buf: ArrayBuffer): string[][] {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  return rows.map((r) => (r as unknown[]).map((c) => (c === null || c === undefined ? '' : String(c).trim())));
}

function guessHeaderRow(grid: string[][]): number {
  let best = 0;
  let bestNonEmpty = -1;
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const nonEmpty = grid[i].filter((c) => c !== '').length;
    if (nonEmpty > bestNonEmpty) { bestNonEmpty = nonEmpty; best = i; }
  }
  return best;
}

export default function StructuredMapper({ fileName: initialFileName, file, onMapped, initialMapping, initialBatch }: {
  fileName: string;
  file: File;
  onMapped: (payload: MappedPayload) => void;
  initialMapping?: Record<string, string | null>;
  initialBatch?: Record<string, string>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName]   = useState(initialFileName);
  const [grid, setGrid]           = useState<string[][] | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping]     = useState<Record<string, string | null>>({});
  const [batch, setBatch]         = useState<Record<string, string>>({});
  const [parseError, setParseError] = useState('');
  const loadedRef = useRef(false);
  const [realtors, setRealtors] = useState<Realtor[]>([]);
  const [zones, setZones] = useState<ZoneEntry[]>([]);

  useEffect(() => {
    fetch('/api/realtors').then((r) => r.json()).then((d) => setRealtors(d.realtors ?? [])).catch(() => {});
    fetch('/api/zones').then((r) => r.json()).then((d) => setZones(d.zones ?? [])).catch(() => {});
  }, []);

  const loadFile = useCallback(async (f: File) => {
    setParseError('');
    setFileName(f.name);
    try {
      const buf = await f.arrayBuffer();
      const g = sheetTo2D(buf);
      if (g.length === 0) { setParseError('File appears to be empty.'); return; }
      const hRow = guessHeaderRow(g);
      setGrid(g);
      setHeaderRow(hRow);
      const headers = g[hRow].map((h, i) => h || `Column ${i + 1}`);
      setMapping(initialMapping ?? suggestMapping(headers));
      setBatch(initialBatch ?? {});
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read this file.');
    }
  }, [initialMapping, initialBatch]);

  if (!loadedRef.current) {
    loadedRef.current = true;
    loadFile(file);
  }

  const headers = useMemo(() => {
    if (!grid) return [];
    return grid[headerRow].map((h, i) => h || `Column ${i + 1}`);
  }, [grid, headerRow]);

  const dataRows = useMemo(() => {
    if (!grid) return [];
    return grid
      .slice(headerRow + 1)
      .filter((r) => r.some((c) => c !== ''))
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  }, [grid, headerRow, headers]);

  function sampleFor(header: string): string {
    for (const row of dataRows) {
      if (row[header] && row[header] !== '') return row[header];
      if (dataRows.indexOf(row) > 20) break;
    }
    return '—';
  }

  const requiredUnmapped = MASTER_FIELDS.filter((f) => f.required && !mapping[f.key]).length;
  const batchMissing     = BATCH_FIELDS.filter((f) => f.required && !batch[f.key]?.trim()).length;

  function proceed() {
    if (!grid) return;
    onMapped({ fileName, headers, rows: dataRows, mapping, batch });
  }

  if (parseError) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4">{parseError}</div>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="text-sm text-blue-600 underline"
        >Choose a different file</button>
      </div>
    );
  }

  if (!grid) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-600">Reading {fileName}…</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Mapping — {fileName}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{dataRows.length} data row(s) detected. Match each master field to a source column — nothing is guessed.</p>
        </div>
        <a
          href="/api/units-template"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-xs text-blue-700 hover:border-blue-500 hover:bg-blue-50 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download Schema Template
        </a>
      </div>

      {/* Header row picker */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Select Header Row</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Click the row that contains your column titles. Everything below it is treated as data.</p>
        </div>
        <div className="max-h-56 overflow-y-auto">
          {grid.slice(0, 30).map((row, i) => (
            <button
              key={i}
              onClick={() => { setHeaderRow(i); setMapping(suggestMapping(row.map((h, j) => h || `Column ${j + 1}`))); }}
              className={`w-full text-left px-4 py-1.5 text-[11px] font-mono border-b border-gray-100 truncate transition-colors ${
                i === headerRow ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              <span className="text-gray-300 mr-2">R{i + 1}</span>{row.filter(Boolean).join(' | ') || '(blank row)'}
            </button>
          ))}
        </div>
      </div>

      {/* Match & Review */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Match &amp; Review</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Map each master field to a source column, or leave it unmapped — unmapped fields become null, never a guess.</p>
          </div>
          {requiredUnmapped > 0 && (
            <span className="text-[11px] text-amber-600 shrink-0">{requiredUnmapped} required field(s) unmapped</span>
          )}
        </div>
        <div className="divide-y divide-gray-100">
          {MASTER_FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-[1fr_1fr_1fr] gap-4 px-4 py-3 items-center">
              <div>
                <p className="text-sm text-gray-800">
                  {f.label} {f.required && <span className="text-red-500 text-xs">*</span>}
                </p>
                <p className="text-[10px] text-gray-400 font-mono">{f.key}{f.enumValues ? ' · enum' : ''}</p>
              </div>
              <select
                value={mapping[f.key] ?? ''}
                onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || null }))}
                className="bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
              >
                <option value="">— Not mapped (null) —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="text-xs text-gray-500 truncate">
                {mapping[f.key] ? `e.g. "${sampleFor(mapping[f.key]!)}"` : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Batch fields */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Batch Details</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Fallback values used when a row doesn&apos;t already have this from the uploaded file — applied to every row, overridable per-row in Validation.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4">
          {BATCH_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="text-[11px] text-gray-500">{f.label} {f.required && <span className="text-red-500">*</span>}</label>
              {f.key === 'realtor_name' ? (
                <RealtorNameField
                  value={batch[f.key] ?? ''}
                  realtors={realtors}
                  onChange={(name) => setBatch((b) => ({ ...b, [f.key]: name }))}
                  onRealtorAdded={(added) => setRealtors((prev) => [...prev, added].sort((a, b) => a.name.localeCompare(b.name)))}
                />
              ) : f.enumValues ? (
                <select
                  value={batch[f.key] ?? ''}
                  onChange={(e) => setBatch((b) => ({ ...b, [f.key]: e.target.value }))}
                  className="w-full mt-1 bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
                >
                  <option value="">—</option>
                  {f.enumValues.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input
                  value={batch[f.key] ?? ''}
                  onChange={(e) => setBatch((b) => ({ ...b, [f.key]: e.target.value }))}
                  className="w-full mt-1 bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
                  placeholder={f.label}
                />
              )}
            </div>
          ))}
          <div>
            <label className="text-[11px] text-gray-500">Zoning Location</label>
            <ZoneField
              code={batch['zone_fallback'] ?? ''}
              name={batch['zone_fallback_name'] ?? ''}
              zones={zones}
              onChange={next => setBatch(b => ({ ...b, zone_fallback: next.code, zone_fallback_name: next.name }))}
              onZoneAdded={added => setZones(prev => [...prev, added].sort((a, b) => a.district_name.localeCompare(b.district_name)))}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {requiredUnmapped + batchMissing > 0
            ? `${requiredUnmapped + batchMissing} field(s) still need attention — they'll surface as row-level errors in Validation.`
            : 'All required fields are accounted for.'}
        </p>
        <button
          onClick={proceed}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
        >
          Next: Validate Mapping →
        </button>
      </div>
    </div>
  );
}
