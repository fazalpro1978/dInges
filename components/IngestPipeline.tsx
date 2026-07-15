'use client';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import StructuredMapper, { type MappedPayload } from './StructuredMapper';
import StructuredValidator from './StructuredValidator';
import RealtorField, { type Realtor } from './RealtorField';
import { Badge, actionBadge } from './StructuredImportShared';

type StagedRecord = { id: string; row_index: number; [key: string]: unknown };

type RecordDecision = 'import' | 'skip' | 'replace';

// ─── Types ────────────────────────────────────────────────────────────────────

type RowAction = 'new' | 'update' | 'conflict';

type ConflictField = { existing: unknown; incoming: unknown };

type MatchedRecord = {
  rowIndex: number;
  unitId: string | null;
  matchType: string;
  matchConfidence: number;
  rawData: Record<string, unknown>;
  resolvedData: Record<string, unknown>;
  action: RowAction | 'unresolved';
  conflictFields: Record<string, ConflictField> | null;
  existingSnapshot: { status: string; rent: number; furnishing: string } | null;
  _conflictResolved: Record<string, unknown>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Pipeline stages: 0=Upload, 1=Match&Review, 2=Validation, 3=Stage Analysis, 4=REIMS Queue, 5=Done
const STAGE_LABELS = ['Upload', 'Match & Review', 'Validation', 'Stage', 'REIMS Queue', 'Done'];

const FURNISHING_OPTIONS = ['Furnished', 'Semi-Furnished', 'Unfurnished'];
const TYPE_OPTIONS       = ['Apartment', 'Villa', 'Office', 'Studio'];
const KITCHEN_OPTIONS    = ['Open', 'Closed', 'Yes', 'Pantry'];

// All fields shown in the Validation table — used to drive the dynamic bulk-fill toolbar.
// Add any new field here and it will automatically appear in the toolbar when blank.
type FieldDef = { field: string; label: string; type: 'text' | 'number' | 'select'; options?: string[]; step?: string };
const VALIDATION_FIELDS: FieldDef[] = [
  { field: 'property',   label: 'Property',   type: 'text' },
  { field: 'unit_no',    label: 'Unit No.',    type: 'text' },
  { field: 'zone_code',  label: 'Zone #',      type: 'number' },
  { field: 'zone',       label: 'Zone',        type: 'text' },
  { field: 'type',       label: 'Type',        type: 'select', options: TYPE_OPTIONS },
  { field: 'config',     label: 'Config',      type: 'text' },
  { field: 'bathrooms',  label: 'Bath',        type: 'number', step: '0.5' },
  { field: 'parking',   label: 'Parking',     type: 'select', options: ['Yes', 'No'] },
  { field: 'kitchen',   label: 'Kitchen',     type: 'select', options: KITCHEN_OPTIONS },
  { field: 'furnishing', label: 'Furnishing',  type: 'select', options: FURNISHING_OPTIONS },
  { field: 'status',     label: 'Status',      type: 'text' },
  { field: 'rent',       label: 'Rent (QAR)',  type: 'number' },
];

// ─── ConflictResolver ─────────────────────────────────────────────────────────

function ConflictResolver({
  record,
  onChange,
}: {
  record: MatchedRecord;
  onChange: (updated: MatchedRecord) => void;
}) {
  if (!record.conflictFields) return null;

  const resolved = record._conflictResolved ?? {};

  const choose = (field: string, value: unknown) => {
    const next = { ...resolved, [field]: value };
    onChange({ ...record, _conflictResolved: next });
  };

  const fields = Object.entries(record.conflictFields);

  return (
    <div className="mt-2 border border-purple-300 rounded-lg p-3 bg-purple-50">
      <p className="text-xs font-semibold text-purple-700 mb-2">Resolve Conflicts</p>
      {fields.map(([field, { existing, incoming }]) => {
        const chosen = resolved[field];
        return (
          <div key={field} className="mb-2">
            <p className="text-xs font-medium text-gray-700 capitalize mb-1">{field.replace(/_/g, ' ')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => choose(field, existing)}
                className={`flex-1 text-xs px-2 py-1 rounded border ${chosen === existing ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                Keep: {String(existing)}
              </button>
              <button
                onClick={() => choose(field, incoming)}
                className={`flex-1 text-xs px-2 py-1 rounded border ${chosen === incoming ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                Use: {String(incoming)}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IngestPipeline() {
  const [stage, setStage] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Stage 1 → extracted + matched records
  const [matched, setMatched] = useState<MatchedRecord[]>([]);
  const [summary, setSummary] = useState({ new: 0, update: 0, conflict: 0, total: 0 });
  const [realtors, setRealtors] = useState<Realtor[]>([]);
  const [excludedIdx, setExcludedIdx] = useState<Set<number>>(new Set());
  const [bulkRealtor, setBulkRealtor] = useState<{ name: string; moci: string }>({ name: '', moci: '' });
  const [bulkZone, setBulkZone] = useState<{ code: string; name: string }>({ code: '', name: '' });
  const [zones, setZones] = useState<{ zone_code: number; district_name: string }[]>([]);

  // Stage 2 → Validation: per-row reject + inline cell editing + dynamic bulk fill
  const [rejectedInValidation, setRejectedInValidation] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; field: string } | null>(null);
  const [bulkFill, setBulkFill] = useState<Record<string, string>>({});

  // Stage 3 → staged run + Staged Analysis decisions
  const [runId, setRunId] = useState<string | null>(null);
  const [stagedRecords, setStagedRecords] = useState<StagedRecord[]>([]);
  const [recordActions, setRecordActions] = useState<Record<number, RecordDecision>>({});

  // Stage 4 → REIMS Queue polling
  const [approveResult, setApproveResult] = useState<{ approved: number; exported: number } | null>(null);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pollCount, setPollCount] = useState(0);

  // Stage 0, structured (CSV/XLSX) sub-flow
  const [structuredStage, setStructuredStage] = useState<'idle' | 'mapping' | 'validating'>('idle');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [mappedPayload, setMappedPayload] = useState<MappedPayload | null>(null);

  // Batch audit log
  const [batchErrorSummary, setBatchErrorSummary] = useState<{ row: number; field: string; value: unknown; error: string }[]>([]);
  const [batchTotalRows, setBatchTotalRows] = useState(0);

  // ── Stage 0: Upload & Extract ─────────────────────────────────────────────

  const runMatch = useCallback(async (units: Record<string, unknown>[]) => {
    setIsProcessing(true);
    setError(null);
    try {
      const matchRes = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: units }),
      });
      const matchData = await matchRes.json();
      if (!matchRes.ok) throw new Error(matchData.error ?? 'Match failed');

      const records = (matchData.results as MatchedRecord[]).map(r => ({ ...r, _conflictResolved: {} }));
      setMatched(records);
      setExcludedIdx(new Set());
      setRejectedInValidation(new Set());
      setBulkRealtor({ name: '', moci: '' });
      setBulkZone({ code: '', name: '' });
      setSummary(matchData.summary);
      setStructuredStage('idle');
      setPendingFile(null);
      setMappedPayload(null);
      setStage(1);

      fetch('/api/realtors')
        .then(r => r.json())
        .then(d => setRealtors(d.realtors ?? []))
        .catch(() => {});
      fetch('/api/zones')
        .then(r => r.json())
        .then(d => setZones(d.zones ?? []))
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Match failed');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // ── Inline cell editing for Validation table ──────────────────────────────

  const handleCellEdit = useCallback((rowIndex: number, field: string, value: string) => {
    const coerced: unknown = (field === 'zone_code' || field === 'bathrooms')
      ? (value === '' ? undefined : Number(value))
      : value;
    // Auto-populate the paired zone field from the cr_zone_codes registry
    const extra: Record<string, unknown> = {};
    if (field === 'zone_code' && value) {
      const match = zones.find(z => z.zone_code === Number(value));
      if (match) extra.zone = match.district_name;
    } else if (field === 'zone' && value) {
      const match = zones.find(z => z.district_name.toLowerCase() === value.toLowerCase());
      if (match) extra.zone_code = match.zone_code;
    }
    setMatched(prev => prev.map(m =>
      m.rowIndex === rowIndex
        ? { ...m, _conflictResolved: { ...m._conflictResolved, [field]: coerced, ...extra } }
        : m,
    ));
    setEditingCell(null);
  }, []);

  // ── Poll run status when at REIMS Queue stage ─────────────────────────────

  const [pollStatus, setPollStatus] = useState<{ total: number; acked: number } | null>(null);

  const checkStatus = useCallback(async () => {
    if (!runId) return;
    setPollCount(n => n + 1);
    try {
      const res = await fetch(`/api/runs/${runId}/status`);
      if (!res.ok) return;
      const data = await res.json() as { status: string; exported_count: number; allAcknowledged: boolean; total: number; acked: number };
      setPollStatus({ total: data.total ?? 0, acked: data.acked ?? 0 });
      if (data.status === 'exported' || data.allAcknowledged) {
        if (pollRef.current) clearInterval(pollRef.current);
        setApproveResult(prev => ({ approved: prev?.approved ?? 0, exported: data.exported_count ?? 0 }));
        setStage(5); // Done
      }
    } catch {}
  }, [runId]);

  useEffect(() => {
    if (stage !== 4 || !runId) return;
    setPollCount(0);
    checkStatus();
    pollRef.current = setInterval(checkStatus, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [stage, runId, checkStatus]);

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() ?? '';
    if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
      setError(null);
      setFileName(file.name);
      setFileSize(file.size);
      setPendingFile(file);
      setStructuredStage('mapping');
      return;
    }

    setError(null);
    setIsProcessing(true);
    setFileName(file.name);
    setFileSize(file.size);

    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/extract', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Extraction failed');

      const { units } = data as { units: Record<string, unknown>[] };
      await runMatch(units);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setIsProcessing(false);
    }
  }, [runMatch]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const unresolvedConflicts = matched.filter(r => {
    if (r.action !== 'conflict' || !r.conflictFields) return false;
    const fields = Object.keys(r.conflictFields);
    return fields.some(f => r._conflictResolved[f] === undefined);
  }).length;

  // Records that passed Validation (not rejected) — used in stages 3+
  const activeMatched = matched.filter(r => !rejectedInValidation.has(r.rowIndex));

  const stageSummary = activeMatched.reduce(
    (acc, r) => {
      const decision = recordActions[r.rowIndex] ?? 'import';
      if (decision === 'skip') acc.skip++;
      else if (decision === 'replace') acc.replace++;
      else if (r.action === 'new') acc.insert++;
      else acc.update++;
      return acc;
    },
    { insert: 0, update: 0, replace: 0, skip: 0 },
  );

  // ── Stage 2 → Validation → Stage 3: write staged_records ─────────────────

  const handleStage = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const finalRecords = activeMatched.map(r => ({
        ...r,
        resolvedData: { ...r.resolvedData, ...r._conflictResolved },
      }));

      const stageRes = await fetch('/api/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          fileSize,
          results:      finalRecords,
          totalRecords: batchTotalRows || finalRecords.length,
          errorSummary: batchErrorSummary,
        }),
      });
      const stageData = await stageRes.json();
      if (!stageRes.ok) throw new Error(stageData.error ?? 'Stage failed');

      setRunId(stageData.runId);

      const sRes = await fetch(`/api/runs/${stageData.runId}/staged`);
      const sData = await sRes.json();
      setStagedRecords(sData.records ?? []);

      const actions: Record<number, RecordDecision> = {};
      activeMatched.forEach(r => { actions[r.rowIndex] = 'import'; });
      setRecordActions(actions);

      setStage(3); // Stage Analysis
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stage failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Stage 3 → Stage 4: approve non-skipped, REIMS Queue polling ───────────

  const handleProceedToReims = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const approvals = activeMatched
        .map(r => {
          const stagedRec = stagedRecords.find(sr => sr.row_index === r.rowIndex);
          if (!stagedRec) return null;
          const decision = recordActions[r.rowIndex] ?? 'import';
          if (decision === 'skip') {
            return { stagedId: stagedRec.id, decision: 'rejected' as const };
          }
          const finalData = { ...r.resolvedData, ...r._conflictResolved };
          return {
            stagedId: stagedRec.id,
            decision: 'approved' as const,
            resolvedData: decision === 'replace' ? { ...finalData, __force_delete: true } : finalData,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null);

      if (approvals.length === 0) throw new Error('No records selected to send to REIMS');

      const approveRes = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, approvals }),
      });
      const approveData = await approveRes.json();
      if (!approveRes.ok) throw new Error(approveData.error ?? 'Approve failed');

      setApproveResult({ approved: approveData.approved ?? 0, exported: 0 });
      setStage(4); // REIMS Queue
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setBatchErrorSummary([]); setBatchTotalRows(0);
    setStage(0); setMatched([]); setRunId(null); setStagedRecords([]);
    setRecordActions({}); setRejectedInValidation(new Set()); setEditingCell(null);
    setApproveResult(null); setPollStatus(null);
    setFileName(''); setFileSize(0); setError(null);
    setStructuredStage('idle'); setPendingFile(null); setMappedPayload(null);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">REIMS Ingestion Service</h1>
          <p className="text-xs text-gray-500">Vanguard REOS · Data Ingestion & Approval Pipeline</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/batch-logs" className="text-xs text-blue-600 hover:text-blue-800 font-medium underline">
            Batch History
          </Link>
          {(stage > 0 || structuredStage !== 'idle') && (
            <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-800 underline">
              Start Over
            </button>
          )}
        </div>
      </header>

      {/* Stage indicator */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="flex items-center gap-0 max-w-4xl">
          {STAGE_LABELS.map((label, i) => {
            const done   = i < stage;
            const active = i === stage;
            return (
              <React.Fragment key={i}>
                <div className={`flex items-center gap-1.5 ${done || active ? 'text-blue-700' : 'text-gray-400'}`}>
                  <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${done ? 'bg-blue-600 text-white' : active ? 'bg-blue-100 text-blue-700 border-2 border-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                    {done ? '✓' : i + 1}
                  </span>
                  <span className="text-xs font-medium hidden sm:inline">{label}</span>
                </div>
                {i < STAGE_LABELS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${done ? 'bg-blue-600' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <main className="max-w-[1700px] mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* ── Stage 0: Upload ───────────────────────────────────────────── */}
        {stage === 0 && structuredStage === 'mapping' && pendingFile && (
          <StructuredMapper
            fileName={fileName}
            file={pendingFile}
            onMapped={payload => { setMappedPayload(payload); setStructuredStage('validating'); }}
            initialMapping={mappedPayload?.mapping}
            initialBatch={mappedPayload?.batch}
          />
        )}

        {stage === 0 && structuredStage === 'validating' && mappedPayload && (
          <StructuredValidator
            payload={mappedPayload}
            onValidated={(records, errorSummary, totalRows) => {
              setBatchErrorSummary(errorSummary);
              setBatchTotalRows(totalRows);
              runMatch(records);
            }}
            onBack={() => setStructuredStage('mapping')}
          />
        )}

        {stage === 0 && structuredStage === 'idle' && (
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Upload Property Data File</h2>
            <p className="text-sm text-gray-500 mb-6">Supports XLSX, XLS, CSV, PDF, PNG, JPG, WEBP</p>

            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}
            >
              {isProcessing ? (
                <div>
                  <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-600">Extracting & matching records…</p>
                </div>
              ) : (
                <div>
                  <div className="text-4xl mb-3">📂</div>
                  <p className="text-sm font-medium text-gray-700">Drop file here or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">CSV/XLSX → manual column mapping · PDF/Image → Claude AI extraction</p>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        )}

        {/* ── Stage 1: Match & Review ───────────────────────────────────── */}
        {stage === 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Match & Review</h2>
                <p className="text-xs text-gray-500 mt-0.5">{fileName} · {matched.length} records extracted</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={reset}
                  className="text-xs px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 font-semibold"
                >← Back to Upload</button>
                <Badge label={`${summary.new} New`} color="#22c55e" />
                <Badge label={`${summary.update} Update`} color="#3b82f6" />
                {summary.conflict > 0 && <Badge label={`${summary.conflict} Conflict`} color="#a855f7" />}
              </div>
            </div>

            {unresolvedConflicts > 0 && (
              <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg px-4 py-2 text-xs text-purple-700">
                {unresolvedConflicts} conflict{unresolvedConflicts > 1 ? 's' : ''} must be resolved before proceeding.
              </div>
            )}

            <div className="mb-4 border border-blue-200 bg-blue-50 rounded-lg p-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-blue-800 mb-2">
                <input
                  type="checkbox"
                  checked={excludedIdx.size === 0}
                  onChange={e => setExcludedIdx(e.target.checked ? new Set() : new Set(matched.map((_, i) => i)))}
                />
                Select all — bulk apply Realtor to {matched.length - excludedIdx.size} of {matched.length} records
              </label>
              <RealtorField
                name={bulkRealtor.name}
                moci={bulkRealtor.moci}
                realtors={realtors}
                onChange={setBulkRealtor}
                onRealtorAdded={added => setRealtors(prev => [...prev, added].sort((a, b) => a.name.localeCompare(b.name)))}
              />
              <button
                disabled={!bulkRealtor.name.trim() || matched.length === excludedIdx.size}
                onClick={() => setMatched(prev => prev.map((m, i) => excludedIdx.has(i)
                  ? m
                  : { ...m, _conflictResolved: { ...m._conflictResolved, realtor_name: bulkRealtor.name, realtor_moci: bulkRealtor.moci } }))}
                className="mt-2 text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold"
              >
                Apply to {matched.length - excludedIdx.size} record{matched.length - excludedIdx.size === 1 ? '' : 's'}
              </button>
            </div>

            <datalist id="zone-names-list">
              {zones.map(z => <option key={z.zone_code} value={z.district_name} />)}
            </datalist>

            <div className="mb-4 border border-teal-200 bg-teal-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-teal-800 mb-2">Zone — bulk apply to all records</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={bulkZone.code}
                  onChange={e => {
                    const code = e.target.value;
                    const match = zones.find(z => z.zone_code === Number(code));
                    setBulkZone({ code, name: match ? match.district_name : bulkZone.name });
                  }}
                  placeholder="Zone code (e.g. 25)"
                  className="w-32 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-teal-500"
                />
                <input
                  type="text"
                  list="zone-names-list"
                  value={bulkZone.name}
                  onChange={e => {
                    const name = e.target.value;
                    const match = zones.find(z => z.district_name.toLowerCase() === name.toLowerCase());
                    setBulkZone({ name, code: match ? String(match.zone_code) : bulkZone.code });
                  }}
                  placeholder="Zone name (e.g. Al Sadd)"
                  className="flex-1 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-teal-500"
                />
              </div>
              <button
                disabled={(!bulkZone.code && !bulkZone.name) || matched.length === excludedIdx.size}
                onClick={() => setMatched(prev => prev.map((m, i) => excludedIdx.has(i)
                  ? m
                  : {
                      ...m,
                      _conflictResolved: {
                        ...m._conflictResolved,
                        ...(bulkZone.code ? { zone_code: Number(bulkZone.code) } : {}),
                        ...(bulkZone.name ? { zone: bulkZone.name } : {}),
                      },
                    }))}
                className="mt-2 text-xs px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-semibold"
              >
                Apply to {matched.length - excludedIdx.size} record{matched.length - excludedIdx.size === 1 ? '' : 's'}
              </button>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {matched.map((r, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!excludedIdx.has(i)}
                      onChange={e => setExcludedIdx(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) next.delete(i); else next.add(i);
                        return next;
                      })}
                    />
                    <span className="text-xs text-gray-400 w-6">#{r.rowIndex + 1}</span>
                    {actionBadge(r.action)}
                    <span className="font-medium text-sm truncate flex-1">{String(r.resolvedData.property ?? r.resolvedData.unit_code ?? '—')}</span>
                    <span className="text-xs text-gray-500">{String(r.resolvedData.unit_no ?? '')}</span>
                    {r.existingSnapshot && (
                      <span className="text-xs text-gray-400 hidden sm:inline">
                        was: {r.existingSnapshot.status} · QAR {r.existingSnapshot.rent?.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {r.action === 'conflict' && (
                    <ConflictResolver
                      record={r}
                      onChange={updated => setMatched(prev => prev.map((m, mi) => mi === i ? updated : m))}
                    />
                  )}
                  <RealtorField
                    name={String(r._conflictResolved.realtor_name ?? r.resolvedData.realtor_name ?? '')}
                    moci={String(r._conflictResolved.realtor_moci ?? r.resolvedData.realtor_moci ?? '')}
                    realtors={realtors}
                    onChange={next => setMatched(prev => prev.map((m, mi) => mi === i
                      ? { ...m, _conflictResolved: { ...m._conflictResolved, realtor_name: next.name, realtor_moci: next.moci } }
                      : m))}
                    onRealtorAdded={added => setRealtors(prev => [...prev, added].sort((a, b) => a.name.localeCompare(b.name)))}
                  />
                  <div className="mt-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Zone</p>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={String(r._conflictResolved.zone_code ?? r.resolvedData.zone_code ?? '')}
                        onChange={e => {
                          const code = e.target.value;
                          const match = zones.find(z => z.zone_code === Number(code));
                          setMatched(prev => prev.map((m, mi) => mi === i ? {
                            ...m, _conflictResolved: {
                              ...m._conflictResolved,
                              zone_code: code ? Number(code) : undefined,
                              ...(match ? { zone: match.district_name } : {}),
                            },
                          } : m));
                        }}
                        placeholder="Code"
                        className="w-24 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
                      />
                      <input
                        type="text"
                        list="zone-names-list"
                        value={String(r._conflictResolved.zone ?? r.resolvedData.zone ?? '')}
                        onChange={e => {
                          const name = e.target.value;
                          const match = zones.find(z => z.district_name.toLowerCase() === name.toLowerCase());
                          setMatched(prev => prev.map((m, mi) => mi === i ? {
                            ...m, _conflictResolved: {
                              ...m._conflictResolved,
                              zone: name,
                              ...(match ? { zone_code: match.zone_code } : {}),
                            },
                          } : m));
                        }}
                        placeholder="Zone name"
                        className="flex-1 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                disabled={unresolvedConflicts > 0}
                onClick={() => setStage(2)}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors"
              >
                Review {matched.length} Records →
              </button>
            </div>
          </div>
        )}

        {/* ── Stage 2: Validation ───────────────────────────────────────── */}
        {stage === 2 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Validation</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Click any cell to correct it · toggle ✓ / ✕ to accept or reject a row ·{' '}
                  <span className="font-semibold text-blue-700">{matched.length - rejectedInValidation.size} / {matched.length}</span> accepted
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRejectedInValidation(new Set())}
                  className="text-xs px-3 py-1.5 border border-green-300 text-green-700 rounded-lg hover:bg-green-50 font-semibold"
                >Accept All</button>
                <button
                  onClick={() => setRejectedInValidation(new Set(matched.map(r => r.rowIndex)))}
                  className="text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 font-semibold"
                >Reject All</button>
              </div>
            </div>

            {/* Dynamic bulk-fill toolbar — shows only fields with at least one ? in this upload */}
            {(() => {
              const getVal = (m: MatchedRecord, field: string) =>
                String(m._conflictResolved[field] ?? m.resolvedData[field] ?? '').trim();
              const missingFields = VALIDATION_FIELDS.filter(f =>
                matched.some(m => !rejectedInValidation.has(m.rowIndex) && !getVal(m, f.field))
              );
              if (missingFields.length === 0) return null;
              return (
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 items-center bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <span className="text-xs font-semibold text-amber-700">Bulk fill missing fields:</span>
                  {missingFields.map(f => (
                    <div key={f.field} className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-600 font-medium">{f.label}</span>
                      {f.type === 'select' ? (
                        <select
                          value={bulkFill[f.field] ?? ''}
                          onChange={e => setBulkFill(prev => ({ ...prev, [f.field]: e.target.value }))}
                          className="border border-gray-300 rounded px-1.5 py-0.5 text-xs bg-white focus:outline-none focus:border-amber-400"
                        >
                          <option value="">—</option>
                          {f.options!.map(o => <option key={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          type={f.type}
                          step={f.step}
                          list={f.field === 'zone' ? 'zone-names-list' : undefined}
                          value={bulkFill[f.field] ?? ''}
                          onChange={e => setBulkFill(prev => ({ ...prev, [f.field]: e.target.value }))}
                          placeholder="—"
                          className="w-24 border border-gray-300 rounded px-1.5 py-0.5 text-xs bg-white focus:outline-none focus:border-amber-400"
                        />
                      )}
                      <button
                        disabled={!bulkFill[f.field]}
                        onClick={() => {
                          const val = bulkFill[f.field] ?? '';
                          const isNumeric = f.field === 'zone_code' || f.field === 'bathrooms' || f.field === 'rent';
                          const coerced: unknown = isNumeric ? Number(val) : val;
                          // Zone auto-populate when bulk-applying one of the pair
                          const zoneExtra = (m: MatchedRecord): Record<string, unknown> => {
                            if (f.field === 'zone_code') {
                              const match = zones.find(z => z.zone_code === Number(val));
                              return match ? { zone: match.district_name } : {};
                            }
                            if (f.field === 'zone') {
                              const match = zones.find(z => z.district_name.toLowerCase() === val.toLowerCase());
                              return match ? { zone_code: match.zone_code } : {};
                            }
                            return {};
                          };
                          setMatched(prev => prev.map(m => rejectedInValidation.has(m.rowIndex) ? m : {
                            ...m, _conflictResolved: { ...m._conflictResolved, [f.field]: coerced, ...zoneExtra(m) },
                          }));
                        }}
                        className="text-xs px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded disabled:opacity-40"
                      >Apply all</button>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs min-w-[1200px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold">
                    <th className="px-3 py-2 text-left w-8">#</th>
                    <th className="px-2 py-2 text-left">Match</th>
                    <th className="px-2 py-2 text-left min-w-[120px]">Property</th>
                    <th className="px-2 py-2 text-left w-16">Unit No.</th>
                    <th className="px-2 py-2 text-left w-14">Zone #</th>
                    <th className="px-2 py-2 text-left min-w-[100px]">Zone</th>
                    <th className="px-2 py-2 text-left w-20">Type</th>
                    <th className="px-2 py-2 text-left w-16">Config</th>
                    <th className="px-2 py-2 text-left w-12">Bath</th>
                    <th className="px-2 py-2 text-left w-16">Parking</th>
                    <th className="px-2 py-2 text-left w-20">Kitchen</th>
                    <th className="px-2 py-2 text-left w-24">Furnishing</th>
                    <th className="px-2 py-2 text-left min-w-[120px]">Status</th>
                    <th className="px-2 py-2 text-right w-20">Rent (QAR)</th>
                    <th className="px-2 py-2 text-center w-16">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {matched.map(r => {
                    const rejected  = rejectedInValidation.has(r.rowIndex);
                    const getVal    = (field: string) => String(r._conflictResolved[field] ?? r.resolvedData[field] ?? '');
                    const isConflict = (field: string) => !!(r.conflictFields && field in r.conflictFields);
                    const isEdit    = (field: string) => editingCell?.rowIndex === r.rowIndex && editingCell?.field === field;
                    const startEdit = (field: string) => { if (!rejected) setEditingCell({ rowIndex: r.rowIndex, field }); };
                    const td        = (field: string, extra = '') =>
                      `px-2 py-1.5 ${rejected ? 'opacity-40' : 'cursor-pointer hover:bg-blue-50'} ${isConflict(field) ? 'bg-purple-50' : ''} ${extra}`;

                    return (
                      <tr key={r.rowIndex} className={rejected ? 'bg-red-50 text-gray-400' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-1.5 text-gray-400">{r.rowIndex + 1}</td>
                        <td className="px-2 py-1.5">{actionBadge(r.action)}</td>

                        {/* Property */}
                        <td className={td('property')} onClick={() => startEdit('property')}>
                          {isEdit('property')
                            ? <input autoFocus className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs" defaultValue={getVal('property')} onBlur={e => handleCellEdit(r.rowIndex, 'property', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCellEdit(r.rowIndex, 'property', e.currentTarget.value); if (e.key === 'Escape') setEditingCell(null); }} />
                            : <span className={!getVal('property') ? 'text-red-400 font-semibold' : ''}>{getVal('property') || '!'}</span>}
                        </td>

                        {/* Unit No */}
                        <td className={td('unit_no')} onClick={() => startEdit('unit_no')}>
                          {isEdit('unit_no')
                            ? <input autoFocus className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs" defaultValue={getVal('unit_no')} onBlur={e => handleCellEdit(r.rowIndex, 'unit_no', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCellEdit(r.rowIndex, 'unit_no', e.currentTarget.value); if (e.key === 'Escape') setEditingCell(null); }} />
                            : <span className={!getVal('unit_no') ? 'text-red-400 font-semibold' : ''}>{getVal('unit_no') || '!'}</span>}
                        </td>

                        {/* Zone # */}
                        <td className={td('zone_code')} onClick={() => startEdit('zone_code')}>
                          {isEdit('zone_code')
                            ? <input autoFocus type="number" className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs" defaultValue={getVal('zone_code')} onBlur={e => handleCellEdit(r.rowIndex, 'zone_code', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCellEdit(r.rowIndex, 'zone_code', e.currentTarget.value); if (e.key === 'Escape') setEditingCell(null); }} />
                            : <span className={!getVal('zone_code') ? 'text-amber-500 font-semibold' : ''}>{getVal('zone_code') || '?'}</span>}
                        </td>

                        {/* Zone */}
                        <td className={td('zone')} onClick={() => startEdit('zone')}>
                          {isEdit('zone')
                            ? <input autoFocus className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs" defaultValue={getVal('zone')} onBlur={e => handleCellEdit(r.rowIndex, 'zone', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCellEdit(r.rowIndex, 'zone', e.currentTarget.value); if (e.key === 'Escape') setEditingCell(null); }} />
                            : <span className={!getVal('zone') ? 'text-amber-500 font-semibold' : ''}>{getVal('zone') || '?'}</span>}
                        </td>

                        {/* Type (select) */}
                        <td className={td('type')} onClick={() => startEdit('type')}>
                          {isEdit('type')
                            ? <select autoFocus className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs" defaultValue={getVal('type')} onChange={e => handleCellEdit(r.rowIndex, 'type', e.target.value)} onBlur={e => handleCellEdit(r.rowIndex, 'type', e.target.value)}><option value="">—</option>{TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}</select>
                            : <span className={!getVal('type') ? 'text-amber-500 font-semibold' : ''}>{getVal('type') || '?'}</span>}
                        </td>

                        {/* Config */}
                        <td className={td('config')} onClick={() => startEdit('config')}>
                          {isEdit('config')
                            ? <input autoFocus className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs" defaultValue={getVal('config')} onBlur={e => handleCellEdit(r.rowIndex, 'config', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCellEdit(r.rowIndex, 'config', e.currentTarget.value); if (e.key === 'Escape') setEditingCell(null); }} />
                            : <span className={!getVal('config') ? 'text-amber-500 font-semibold' : ''}>{getVal('config') || '?'}</span>}
                        </td>

                        {/* Bath */}
                        <td className={td('bathrooms')} onClick={() => startEdit('bathrooms')}>
                          {isEdit('bathrooms')
                            ? <input autoFocus type="number" step="0.5" min="0" className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs" defaultValue={getVal('bathrooms')} onBlur={e => handleCellEdit(r.rowIndex, 'bathrooms', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCellEdit(r.rowIndex, 'bathrooms', e.currentTarget.value); if (e.key === 'Escape') setEditingCell(null); }} />
                            : <span className={!getVal('bathrooms') ? 'text-amber-500 font-semibold' : ''}>{getVal('bathrooms') || '?'}</span>}
                        </td>

                        {/* Parking (select) */}
                        <td className={td('parking')} onClick={() => startEdit('parking')}>
                          {isEdit('parking')
                            ? <select autoFocus className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs" defaultValue={getVal('parking')} onChange={e => handleCellEdit(r.rowIndex, 'parking', e.target.value)} onBlur={e => handleCellEdit(r.rowIndex, 'parking', e.target.value)}><option value="">—</option>{['Yes','No'].map(o => <option key={o}>{o}</option>)}</select>
                            : <span className={!getVal('parking') ? 'text-amber-500 font-semibold' : ''}>{getVal('parking') || '?'}</span>}
                        </td>

                        {/* Kitchen (select) */}
                        <td className={td('kitchen')} onClick={() => startEdit('kitchen')}>
                          {isEdit('kitchen')
                            ? <select autoFocus className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs" defaultValue={getVal('kitchen')} onChange={e => handleCellEdit(r.rowIndex, 'kitchen', e.target.value)} onBlur={e => handleCellEdit(r.rowIndex, 'kitchen', e.target.value)}><option value="">—</option>{KITCHEN_OPTIONS.map(o => <option key={o}>{o}</option>)}</select>
                            : <span className={!getVal('kitchen') ? 'text-amber-500 font-semibold' : ''}>{getVal('kitchen') || '?'}</span>}
                        </td>

                        {/* Furnishing (select) */}
                        <td className={td('furnishing')} onClick={() => startEdit('furnishing')}>
                          {isEdit('furnishing')
                            ? <select autoFocus className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs" defaultValue={getVal('furnishing')} onChange={e => handleCellEdit(r.rowIndex, 'furnishing', e.target.value)} onBlur={e => handleCellEdit(r.rowIndex, 'furnishing', e.target.value)}><option value="">—</option>{FURNISHING_OPTIONS.map(o => <option key={o}>{o}</option>)}</select>
                            : <span className={!getVal('furnishing') ? 'text-amber-500 font-semibold' : ''}>{getVal('furnishing') || '?'}</span>}
                        </td>

                        {/* Status */}
                        <td className={td('status')} onClick={() => startEdit('status')}>
                          {isEdit('status')
                            ? <input autoFocus className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs" defaultValue={getVal('status')} onBlur={e => handleCellEdit(r.rowIndex, 'status', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCellEdit(r.rowIndex, 'status', e.currentTarget.value); if (e.key === 'Escape') setEditingCell(null); }} />
                            : <span className={!getVal('status') ? 'text-red-400 font-semibold' : ''}>{getVal('status') || '!'}</span>}
                        </td>

                        {/* Rent */}
                        <td className={td('rent', 'text-right')} onClick={() => startEdit('rent')}>
                          {isEdit('rent')
                            ? <input autoFocus type="number" className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs text-right" defaultValue={getVal('rent')} onBlur={e => handleCellEdit(r.rowIndex, 'rent', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCellEdit(r.rowIndex, 'rent', e.currentTarget.value); if (e.key === 'Escape') setEditingCell(null); }} />
                            : <span className={!getVal('rent') ? 'text-red-400 font-semibold' : ''}>{getVal('rent') ? Number(getVal('rent')).toLocaleString() : '!'}</span>}
                        </td>

                        {/* Accept / Reject — two explicit buttons */}
                        <td className="px-2 py-1.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              title="Accept"
                              onClick={() => setRejectedInValidation(prev => { const next = new Set(prev); next.delete(r.rowIndex); return next; })}
                              className={`w-7 h-7 rounded-full text-sm font-bold transition-colors ${!rejected ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600'}`}
                            >✓</button>
                            <button
                              title="Reject"
                              onClick={() => setRejectedInValidation(prev => { const next = new Set(prev); next.add(r.rowIndex); return next; })}
                              className={`w-7 h-7 rounded-full text-sm font-bold transition-colors ${rejected ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500'}`}
                            >✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
              <span><span className="text-red-400 font-semibold">!</span> = required field missing</span>
              <span><span className="text-amber-500 font-semibold">?</span> = value not set / inferred</span>
              <span><span className="bg-purple-100 text-purple-700 px-1 rounded">purple</span> = conflict field</span>
            </div>

            <div className="mt-6 flex justify-between items-center">
              <button
                onClick={() => setStage(1)}
                className="text-xs px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 font-semibold"
              >← Back to Match & Review</button>
              <button
                disabled={rejectedInValidation.size === matched.length || isProcessing}
                onClick={handleStage}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors"
              >
                {isProcessing ? 'Staging…' : `Confirm & Stage ${matched.length - rejectedInValidation.size} Records →`}
              </button>
            </div>
          </div>
        )}

        {/* ── Stage 3: Stage Analysis ───────────────────────────────────── */}
        {stage === 3 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Stage Analysis</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Run <span className="font-mono">{runId}</span> · review the REIMS impact of each record before sending
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge label={`${stageSummary.insert} Insert`} color="#22c55e" />
                <Badge label={`${stageSummary.update} Update`} color="#3b82f6" />
                {stageSummary.replace > 0 && <Badge label={`${stageSummary.replace} Replace`} color="#f97316" />}
                {stageSummary.skip > 0 && <Badge label={`${stageSummary.skip} Skip`} color="#9ca3af" />}
              </div>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {activeMatched.map((r, i) => {
                const finalData = { ...r.resolvedData, ...r._conflictResolved } as Record<string, unknown>;
                const decision = recordActions[r.rowIndex] ?? 'import';
                const hasExisting = r.existingSnapshot !== null;
                const diffFields: { field: string; from: unknown; to: unknown }[] = [];
                if (r.existingSnapshot) {
                  (['status', 'rent', 'furnishing'] as const).forEach(f => {
                    const before = r.existingSnapshot![f];
                    const after = finalData[f];
                    if (after !== undefined && String(before) !== String(after)) {
                      diffFields.push({ field: f, from: before, to: after });
                    }
                  });
                }
                return (
                  <div key={i} className={`border rounded-lg p-3 ${decision === 'skip' ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-6">#{r.rowIndex + 1}</span>
                      {actionBadge(r.action)}
                      <span className="font-medium text-sm truncate flex-1">{String(finalData.property ?? finalData.unit_code ?? '—')}</span>
                      <span className="text-xs text-gray-500">{String(finalData.unit_no ?? '')}</span>
                      <select
                        value={decision}
                        onChange={e => setRecordActions(prev => ({ ...prev, [r.rowIndex]: e.target.value as RecordDecision }))}
                        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white font-medium"
                      >
                        <option value="import">{r.action === 'new' ? 'Insert' : 'Update'}</option>
                        <option value="skip">Skip</option>
                        {hasExisting && <option value="replace">Delete &amp; Re-insert</option>}
                      </select>
                    </div>
                    {diffFields.length > 0 && decision !== 'skip' && (
                      <div className="mt-2 ml-8 flex flex-wrap gap-2">
                        {diffFields.map(d => (
                          <span key={d.field} className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-0.5">
                            <span className="capitalize">{d.field}</span>: {String(d.from)} → {String(d.to)}
                          </span>
                        ))}
                      </div>
                    )}
                    {decision === 'replace' && (
                      <p className="mt-2 ml-8 text-xs text-orange-600">Existing REIMS unit will be deleted and re-inserted fresh.</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-between items-center">
              <button
                onClick={() => setStage(2)}
                className="text-xs px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 font-semibold"
              >← Back to Validation</button>
              <button
                disabled={isProcessing}
                onClick={handleProceedToReims}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors"
              >
                {isProcessing ? 'Sending…' : `Send ${activeMatched.length - stageSummary.skip} Records to REIMS →`}
              </button>
            </div>
          </div>
        )}

        {/* ── Stage 4: REIMS Queue (polling) ────────────────────────────── */}
        {stage === 4 && (() => {
          const isTimedOut  = pollCount > 75;  // ~5 min
          const isSlowWarn  = pollCount > 30 && !isTimedOut; // ~2 min
          return (
            <div className={`bg-white rounded-xl border p-10 text-center max-w-2xl mx-auto ${isTimedOut ? 'border-orange-300' : 'border-gray-200'}`}>
              {isTimedOut ? (
                <div className="text-4xl mb-4">⚠️</div>
              ) : (
                <div className="w-14 h-14 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-5" />
              )}

              <h2 className={`text-xl font-bold mb-2 ${isTimedOut ? 'text-orange-700' : 'text-gray-900'}`}>
                {isTimedOut ? 'Still Waiting — Action Required' : 'Queued for REIMS Export'}
              </h2>
              <p className="text-sm text-gray-500 mb-1">
                Run <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{runId}</span>
              </p>
              <p className="text-sm text-gray-500 mb-8">
                <span className="font-semibold text-blue-600">{approveResult?.approved ?? activeMatched.length}</span> records are in the vetted queue, ready for REIMS
              </p>

              {isTimedOut ? (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 text-left mb-6">
                  <p className="text-xs font-bold text-orange-700 uppercase tracking-widest mb-2">REIMS has not confirmed — check manually</p>
                  <ol className="text-xs text-orange-700 space-y-1.5 list-decimal list-inside">
                    <li>Open REIMS → dInges Queue → if records appear, click <strong>Import All</strong></li>
                    <li>If REIMS already shows &ldquo;Import Complete&rdquo;, the pipeline is Done — click <strong>Start Over</strong> above to reset</li>
                    <li>If REIMS shows an error, re-upload this file from the beginning</li>
                  </ol>
                </div>
              ) : (
                <div className={`${isSlowWarn ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'} border rounded-xl p-5 text-left mb-6`}>
                  {isSlowWarn && (
                    <p className="text-xs text-amber-700 font-semibold mb-2">Taking longer than expected — go to REIMS and check the dInges Queue</p>
                  )}
                  <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${isSlowWarn ? 'text-amber-700' : 'text-blue-700'}`}>Next Step — REIMS IngestQueue</p>
                  <ol className={`text-xs space-y-1.5 list-decimal list-inside ${isSlowWarn ? 'text-amber-700' : 'text-blue-700'}`}>
                    <li>Open <span className="font-semibold">REIMS</span> and click <span className="font-mono bg-blue-100 px-1 rounded">dInges Queue</span> in the sidebar</li>
                    <li>Preview the records and click <span className="font-semibold">Import All →</span></li>
                    <li>This screen will automatically advance to Done once REIMS confirms</li>
                  </ol>
                </div>
              )}

              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${isTimedOut ? 'bg-orange-400' : 'bg-green-400'}`} />
                  {pollStatus
                    ? `${pollStatus.acked} / ${pollStatus.total} records acknowledged`
                    : 'Watching for REIMS acknowledgement…'}
                </div>
                <div className="flex items-center gap-4 mt-1">
                  <button
                    onClick={checkStatus}
                    className="text-xs text-blue-500 hover:text-blue-700 underline"
                  >
                    Check now
                  </button>
                  {isTimedOut && (
                    <button
                      onClick={reset}
                      className="text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors"
                    >
                      Start Over
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Stage 5: Done ─────────────────────────────────────────────── */}
        {stage === 5 && approveResult && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center max-w-xl mx-auto">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Imported to REIMS</h2>
            <p className="text-sm text-gray-500 mb-6">
              Run <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{runId}</span> · acknowledged by REIMS
            </p>

            <div className="flex justify-center gap-8 mb-8">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">{approveResult.approved}</p>
                <p className="text-xs text-gray-500 mt-1">Staged</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{approveResult.exported || approveResult.approved}</p>
                <p className="text-xs text-gray-500 mt-1">Imported to REIMS</p>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 mb-6">
              Records are now live in the REIMS Units Inventory.
            </div>

            <button
              onClick={reset}
              className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              Upload Another File
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
