// lib/parsers/normalisers.ts
// Global normalisation rules — single source of truth for all parsers and the AI prompt.
// Import these instead of defining local helpers in each parser file.

import * as xlsx from 'xlsx';

// ── AI extraction thresholds ────────────────────────────────────────────────
export const AI_SAFE_ROWS   = 80;   // below: low risk
export const AI_WARN_ROWS   = 150;  // above: truncation risk
export const TOKENS_PER_ROW = 220;  // conservative estimate for freeform rich-description rows

// ── Cell helpers ────────────────────────────────────────────────────────────
export function cellStr(ws: xlsx.WorkSheet, r: number, c: number): string {
  const cell = ws[xlsx.utils.encode_cell({ r, c })] as xlsx.CellObject | undefined;
  return (cell?.v ?? '').toString().trim();
}

export function cellRaw(ws: xlsx.WorkSheet, r: number, c: number): unknown {
  const cell = ws[xlsx.utils.encode_cell({ r, c })] as xlsx.CellObject | undefined;
  return cell?.v ?? '';
}

// ── Status ──────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, string> = {
  'available':          'Available',
  'vacant':             'Available',
  'leased':             'Leased',
  'reserved':           'Reserved',
  'booked':             'Reserved',
  'need_m':             'Under_Maintenance',
  'upcoming':           'Under_Maintenance',
  'under_maintenance':  'Under_Maintenance',
  'under maintenance':  'Under_Maintenance',
  'under preparation':  'Under_Maintenance',
};

export function normStatus(raw: string): string {
  return STATUS_MAP[raw.trim().toLowerCase()] ?? raw.trim();
}

// ── Furnishing ──────────────────────────────────────────────────────────────
export function normFurnishing(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (['FURNISHED', 'FULLY FURNISHED', 'FF', 'FULLY-FURNISHED', 'FULL FURNISHED'].includes(s))
    return 'Fully Furnished';
  if (s.startsWith('SEMI') || ['SF', 'SEMI-FURNISHED', 'SEMIFURNISHED'].includes(s))
    return 'Semi-Furnished';
  if (['UF', 'UNFURNISHED', 'UN-FURNISHED'].includes(s))
    return 'Unfurnished';
  return raw.trim();
}

// ── Property type ───────────────────────────────────────────────────────────
export function normType(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (['APARTMENT', 'APT', 'APT.', 'FLAT'].includes(s)) return 'Apartment';
  if (['VILLA', 'VIL'].includes(s))                      return 'Villa';
  if (s === 'STUDIO')                                    return 'Studio';
  if (s === 'OFFICE')                                    return 'Office';
  if (s === 'TOWNHOUSE')                                 return 'Townhouse';
  if (s === 'DUPLEX')                                    return 'Duplex';
  if (s === 'ROWHOUSE')                                  return 'Rowhouse';
  return raw.trim();
}

// ── Config (BHK / BR) ───────────────────────────────────────────────────────
// Canonical output: "N BHK" or "Studio"
export function normConfig(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (/^studio$/i.test(s)) return 'Studio';
  const compact = s.match(/^(\d+)\s*BHK$/i);
  if (compact) return `${compact[1]} BHK`;
  const br = s.match(/^(\d+)\s*BR$/i);
  if (br) return `${br[1]} BHK`;
  const spaced = s.match(/^(\d+)\s+BHK$/i);
  if (spaced) return `${spaced[1]} BHK`;
  return s;
}

// ── Rent ────────────────────────────────────────────────────────────────────
export function normRent(raw: unknown): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const cleaned = String(raw).replace(/[^\d.]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}
