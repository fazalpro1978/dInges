import { NextRequest, NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import { isRetajSheet } from '../../../lib/parsers/retaj';
import { isDanatQatarSheet } from '../../../lib/parsers/danatQatar';
import { isCapSheet } from '../../../lib/parsers/cap';
import { AI_SAFE_ROWS, AI_WARN_ROWS, TOKENS_PER_ROW } from '../../../lib/parsers/normalisers';

export const maxDuration = 30;

export type PreflightResult = {
  fileName: string;
  ext: string;
  sheets: Array<{ name: string; rows: number }>;
  totalRows: number | null;
  detectedFormat: string;
  parserType: 'retaj' | 'danat-qatar' | 'cap' | 'ai-extraction';
  estimatedOutputTokens: number | null;
  riskLevel: 'safe' | 'warn' | 'danger';
  warnings: string[];
};

function countDataRows(ws: xlsx.WorkSheet): number {
  const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1');
  let count = 0;
  for (let r = 1; r <= range.e.r; r++) {
    const cell = ws[xlsx.utils.encode_cell({ r, c: 0 })];
    if (cell?.v && String(cell.v).trim()) count++;
  }
  return count;
}

function preflightJson(result: PreflightResult) {
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    return preflightJson({
      fileName: file.name,
      ext,
      sheets: [],
      totalRows: null,
      detectedFormat: ext.toUpperCase(),
      parserType: 'ai-extraction',
      estimatedOutputTokens: null,
      riskLevel: 'warn',
      warnings: [`${ext.toUpperCase()} files use AI extraction. Processing time depends on content length.`],
    });
  }

  const bytes = await file.arrayBuffer();
  const buf = Buffer.from(bytes);
  const wb = xlsx.read(buf, { type: 'buffer' });

  const sheets: Array<{ name: string; rows: number }> = [];
  let detectedFormat = 'Freeform (AI extraction)';
  let parserType: PreflightResult['parserType'] = 'ai-extraction';

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (isRetajSheet(name, ws)) {
      detectedFormat = 'Retaj AXIOM Import Template';
      parserType = 'retaj';
    } else if (isDanatQatarSheet(name, ws)) {
      detectedFormat = 'Danat Qatar Template';
      parserType = 'danat-qatar';
    } else if (isCapSheet(name, ws)) {
      detectedFormat = 'CAP Properties Qatar';
      parserType = 'cap';
    }
    sheets.push({ name, rows: countDataRows(ws) });
  }

  const totalRows = sheets.reduce((sum, s) => sum + s.rows, 0);
  const estimatedOutputTokens = parserType === 'ai-extraction' ? totalRows * TOKENS_PER_ROW : 0;
  const isDeterministic = parserType !== 'ai-extraction';

  let riskLevel: PreflightResult['riskLevel'] = 'safe';
  const warnings: string[] = [];

  if (isDeterministic) {
    // always safe
  } else {
    if (totalRows > AI_WARN_ROWS) {
      riskLevel = 'danger';
      warnings.push(`${totalRows} rows detected. Large files risk output truncation. Processing in streaming mode — may take 1–3 minutes.`);
    } else if (totalRows > AI_SAFE_ROWS) {
      riskLevel = 'warn';
      warnings.push(`${totalRows} rows. Moderately large file — AI extraction may take up to 60 seconds.`);
    }
  }

  return preflightJson({
    fileName: file.name,
    ext,
    sheets,
    totalRows,
    detectedFormat,
    parserType,
    estimatedOutputTokens,
    riskLevel,
    warnings,
  });
}
