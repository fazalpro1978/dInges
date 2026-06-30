'use client';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import StructuredMapper, { type MappedPayload } from './StructuredMapper';
import StructuredValidator from './StructuredValidator';
import RealtorField, { type Realtor } from './RealtorField';
import { Badge, actionBadge } from './StructuredImportShared';

type StagedRecord = { id: string; [key: string]: unknown };

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
  // locally tracked conflict resolutions
  _conflictResolved: Record<string, unknown>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_LABELS = ['Upload', 'Match & Review', 'Stage', 'REIMS Queue', 'Done'];

// "Stage" (index 2) is a silent auto-step; map code stages 0-3 to the visual step index
// that should appear active: 0→0, 1→1, 2→3 (REIMS Queue), 3→4 (Done)
const STAGE_TO_STEP = [0, 1, 3, 4] as const;

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

  // Stage 2 → staged run
  const [runId, setRunId] = useState<string | null>(null);
  const [stagedRecords, setStagedRecords] = useState<StagedRecord[]>([]);

  // Stage 2 → REIMS Queue polling
  const [approveResult, setApproveResult] = useState<{ approved: number; exported: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stage 0, structured (CSV/XLSX) sub-flow — deterministic Mapping → Validation, bypasses /api/extract
  const [structuredStage, setStructuredStage] = useState<'idle' | 'mapping' | 'validating'>('idle');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [mappedPayload, setMappedPayload] = useState<MappedPayload | null>(null);

  // Batch audit log — captured from StructuredValidator for inclusion in /api/stage payload
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
      setBulkRealtor({ name: '', moci: '' });
      setSummary(matchData.summary);
      setStructuredStage('idle');
      setPendingFile(null);
      setMappedPayload(null);
      setStage(1);

      fetch('/api/realtors')
        .then(r => r.json())
        .then(d => setRealtors(d.realtors ?? []))
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Match failed');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Poll run status when at REIMS Queue stage — auto-advance when REIMS acknowledges
  useEffect(() => {
    if (stage !== 2 || !runId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}/status`);
        const data = await res.json() as { status: string; exported_count: number };
        if (data.status === 'exported') {
          clearInterval(pollRef.current!);
          setApproveResult(prev => ({ approved: prev?.approved ?? 0, exported: data.exported_count ?? 0 }));
          setStage(3);
        }
      } catch {}
    }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [stage, runId]);

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

  // ── Stage 1 → Stage + Auto-approve → REIMS Queue ────────────────────────

  const handleStage = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const finalRecords = matched.map(r => ({
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

      // Load staged records then auto-approve all
      const sRes = await fetch(`/api/runs/${stageData.runId}/staged`);
      const sData = await sRes.json();
      setStagedRecords(sData.records ?? []);

      const approvals = (sData.records ?? []).map((r: StagedRecord) => ({
        stagedId: r.id,
        decision: 'approved',
      }));

      const approveRes = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: stageData.runId, approvals }),
      });
      const approveData = await approveRes.json();
      if (!approveRes.ok) throw new Error(approveData.error ?? 'Auto-approve failed');

      setApproveResult({ approved: approveData.approved ?? approvals.length, exported: 0 });
      setStage(2); // REIMS Queue — polls until REIMS acknowledges
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stage failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setBatchErrorSummary([]); setBatchTotalRows(0);
    setStage(0); setMatched([]); setRunId(null); setStagedRecords([]);
    setApproveResult(null);
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
        <div className="flex items-center gap-0 max-w-3xl">
          {STAGE_LABELS.map((label, i) => {
            const currentStep = STAGE_TO_STEP[stage];
            const done    = i < currentStep;
            const active  = i === currentStep;
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

        {/* ── Stage 1: Match Review ─────────────────────────────────────── */}
        {stage === 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Match Review</h2>
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
                {unresolvedConflicts} conflict{unresolvedConflicts > 1 ? 's' : ''} must be resolved before staging.
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
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                disabled={unresolvedConflicts > 0 || isProcessing}
                onClick={handleStage}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors"
              >
                {isProcessing ? 'Staging…' : `Stage ${matched.length} Records →`}
              </button>
            </div>
          </div>
        )}

        {/* ── Stage 2: REIMS Queue (polling) ────────────────────────────── */}
        {stage === 2 && (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center max-w-2xl mx-auto">
            <div className="w-14 h-14 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-5" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Queued for REIMS Export</h2>
            <p className="text-sm text-gray-500 mb-1">
              Run <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{runId}</span>
            </p>
            <p className="text-sm text-gray-500 mb-8">
              <span className="font-semibold text-blue-600">{approveResult?.approved ?? stagedRecords.length}</span> records are in the vetted queue, ready for REIMS
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-left mb-6">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-2">Next Step — REIMS IngestQueue</p>
              <ol className="text-xs text-blue-700 space-y-1.5 list-decimal list-inside">
                <li>Open <span className="font-semibold">REIMS</span> and click <span className="font-mono bg-blue-100 px-1 rounded">dInges Queue</span> in the sidebar</li>
                <li>Preview the records and click <span className="font-semibold">Import All →</span></li>
                <li>This screen will automatically advance to Done once REIMS confirms</li>
              </ol>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Watching for REIMS acknowledgement…
            </div>
          </div>
        )}

        {/* ── Stage 3: Done ─────────────────────────────────────────────── */}
        {stage === 3 && approveResult && (
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
