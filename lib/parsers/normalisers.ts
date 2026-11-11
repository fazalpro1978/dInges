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

// ── Utilities from "Bills" wording ──────────────────────────────────────────
// "NOT INC" / "NOT INCLUDED" / "EXCLUDING …" → Kahramaa deposit applicable, water & electricity Excluded.
// Any other "INC…" wording (INC, INC., INCLUDING ALL, INCLUDING KAHRAMA ONLY, INC W & E) → not applicable, Included.
export function normBills(raw: string): { kahramaa_applicable: boolean; water_electricity: 'Included' | 'Excluded' } | null {
  const s = raw.trim().toUpperCase();
  if (!s) return null;
  if (/^(NOT\s*INC|EXCLUDING|EXCL\b)/.test(s)) return { kahramaa_applicable: true, water_electricity: 'Excluded' };
  if (/INC/.test(s)) return { kahramaa_applicable: false, water_electricity: 'Included' };
  return null;
}

// ── Defaults for fields a source file never provides ────────────────────────
// Bathrooms follow the bedroom count; parking and kitchen default to Yes. Every default adds a
// "<Field> Details Not Provided, Please Cross Check" line to operator_remarks so a person verifies it.
// Set AXIOM_MISSING_FIELD_DEFAULTS=off to disable without a code change.
export function defaultBathrooms(config?: string): number | undefined {
  if (!config) return undefined;
  if (config === 'Studio') return 1.5;
  if (config === 'Duplex') return 2.5;
  const n = Number(/^(\d+) BHK$/.exec(config)?.[1]);
  if (!n) return undefined;
  return n === 1 ? 1 : n === 2 ? 1.5 : n === 3 ? 2.5 : n === 4 ? 3.5 : 4;
}

const COMMERCIAL_TYPES = new Set(['office', 'shop', 'retail', 'warehouse', 'showroom', 'industrial']);
const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

export function applyMissingFieldDefaults(u: Record<string, unknown>): Record<string, unknown> {
  if (process.env.AXIOM_MISSING_FIELD_DEFAULTS === 'off') return u;
  if (COMMERCIAL_TYPES.has(String(u.type ?? '').trim().toLowerCase())) return u;
  const notes: string[] = [];
  if (isBlank(u.bathrooms)) {
    const b = defaultBathrooms(typeof u.config === 'string' ? u.config : undefined);
    if (b !== undefined) { u.bathrooms = b; notes.push('Bathroom Details Not Provided, Please Cross Check'); }
  }
  if (isBlank(u.parking)) { u.parking = 'Yes'; notes.push('Parking Details Not Provided, Please Cross Check'); }
  if (isBlank(u.kitchen)) { u.kitchen = 'Yes'; notes.push('Kitchen Details Not Provided, Please Cross Check'); }
  if (notes.length) {
    const existing = String(u.operator_remarks ?? '').trim();
    u.operator_remarks = [existing, ...notes.filter(n => !existing.includes(n))].filter(Boolean).join(' · ');
  }
  return u;
}
