// lib/parsers/danatQatar.ts
// Dedicated pre-processor for the Danat Qatar realtor template.
// Runs as a source-specific layer BEFORE the standard pipeline — importSchema.ts,
// castAndValidateField, cr_assign_smart_code and cr_generate_master_code are untouched.
//
// Template signature: "Units Import" sheet, 15 columns, rows 2–118+
// Realtor: Danat Qatar (Alfardan Gardens / Majduleen Gardens, Doha)

import * as xlsx from 'xlsx';

// ── Column indices (0-based) ────────────────────────────────────────────────
const COL = {
  property:      0,   // Property Name *
  unit_no:       1,   // Property Unit No *
  // zone_number: 2 → always blank; derived from area_location instead
  area_location: 3,   // Area / Location → zone (text) + zone_code (derived)
  type:          4,   // Property Type *
  subtype:       5,   // Property Subtype * → config
  furnishing:    6,   // Furnishing Status *
  // bathrooms:  7 → blank
  // kitchen:    8 → blank
  // parking:    9 → blank
  rent:         10,   // Rent (QAR / Monthly)
  status:       11,   // Status
  // map_url:   12 → blank
  // media_url: 13 → blank
  // realtor:   14 → blank; hardcoded below
} as const;

// ── Zone derivation (Area/Location text → integer zone_code) ───────────────
// Qatar administrative zone codes. Unknown areas are left null; the
// Validation stage surfaces them for manual entry.
const ZONE_LOOKUP: [string, number][] = [
  ['al waab - abu sidra', 27],
  ['al waab abu sidra',   27],
  ['al waab',            27],
  ['abu sidra',          27],
  ['the pearl',          63],
  ['pearl qatar',        63],
  ['lusail',             69],
  ['west bay',           66],
  ['msheireb',           22],
  ['al sadd',            27],
  ['al dafna',           66],
  ['al khail',           69],
];

function deriveZone(raw: string): { zone: string; zone_code: number | undefined } {
  const zone = raw.trim();
  const norm = zone.toLowerCase().replace(/\s+/g, ' ');
  for (const [key, code] of ZONE_LOOKUP) {
    if (norm.includes(key)) return { zone, zone_code: code };
  }
  return { zone, zone_code: undefined };
}

// ── Normalisation helpers ───────────────────────────────────────────────────

function normStatus(raw: string): string {
  switch (raw.trim().toLowerCase()) {
    case 'available':   return 'Available';
    case 'upcoming':    return 'Under_Maintenance';   // Danat Qatar-specific rule
    case 'leased':      return 'Leased';
    case 'reserved':    return 'Reserved';
    default:            return raw.trim();
  }
}

function normFurnishing(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (['FURNISHED', 'FULLY FURNISHED', 'FF', 'FULLY-FURNISHED', 'FULL FURNISHED'].includes(s)) return 'Fully Furnished';
  if (s.startsWith('SEMI') || ['SF', 'SEMI-FURNISHED', 'SEMIFURNISHED'].includes(s)) return 'Semi-Furnished';
  if (['UF', 'UNFURNISHED', 'UN-FURNISHED'].includes(s)) return 'Unfurnished';
  return raw.trim();
}

function normType(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (['APARTMENT', 'APT', 'APT.', 'FLAT'].includes(s)) return 'Apartment';
  if (['VILLA', 'VIL'].includes(s))                      return 'Villa';
  if (s === 'STUDIO')                                    return 'Studio';
  if (s === 'OFFICE')                                    return 'Office';
  if (s === 'TOWNHOUSE')                                 return 'Townhouse';
  if (s === 'DUPLEX')                                    return 'Duplex';
  return raw.trim();
}

function normConfig(raw: string): string {
  // "4BHK" → "4 BHK"; "4 BHK" → "4 BHK"; pass through if already normalised
  const s = raw.trim();
  const m = s.match(/^(\d+)\s*BHK(.*)/i);
  if (m) return (`${m[1]} BHK${m[2]}`).trim();
  return s;
}

function normRent(raw: unknown): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const cleaned = String(raw).replace(/[^\d.]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function cellStr(ws: xlsx.WorkSheet, r: number, c: number): string {
  const cell = ws[xlsx.utils.encode_cell({ r, c })] as xlsx.CellObject | undefined;
  return (cell?.v ?? '').toString().trim();
}

function cellRaw(ws: xlsx.WorkSheet, r: number, c: number): unknown {
  const cell = ws[xlsx.utils.encode_cell({ r, c })] as xlsx.CellObject | undefined;
  return cell?.v ?? '';
}

// ── Template detection ──────────────────────────────────────────────────────
// Returns true when the worksheet matches the Danat Qatar "Units Import" template.

export function isDanatQatarSheet(sheetName: string, ws: xlsx.WorkSheet): boolean {
  const name = sheetName.toLowerCase().replace(/\s+/g, ' ').trim();
  if (name !== 'units import') return false;

  // Verify header row (row 0) for the distinctive column set
  const h0 = cellStr(ws, 0, COL.property).toLowerCase();
  const h5 = cellStr(ws, 0, COL.subtype).toLowerCase();
  const h3 = cellStr(ws, 0, COL.area_location).toLowerCase();

  return (
    h0.includes('property name') &&
    h5.includes('subtype') &&
    h3.includes('area')
  );
}

// ── Main extractor ──────────────────────────────────────────────────────────

export function parseDanatQatar(ws: xlsx.WorkSheet): Record<string, unknown>[] {
  const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1');
  const results: Record<string, unknown>[] = [];

  for (let r = 1; r <= range.e.r; r++) {
    const property = cellStr(ws, r, COL.property);
    const unit_no  = cellStr(ws, r, COL.unit_no);

    // Skip empty rows and summary/subtotal rows
    if (!property || !unit_no) continue;
    if (/^(total|sub[\s-]?total)/i.test(property)) continue;

    const areaRaw  = cellStr(ws, r, COL.area_location);
    const typeRaw  = cellStr(ws, r, COL.type);
    const subRaw   = cellStr(ws, r, COL.subtype);
    const furnRaw  = cellStr(ws, r, COL.furnishing);
    const statRaw  = cellStr(ws, r, COL.status);
    const rentRaw  = cellRaw(ws, r, COL.rent);

    const { zone, zone_code } = deriveZone(areaRaw);

    const record: Record<string, unknown> = {
      property,
      unit_no,
      type:         normType(typeRaw)     || undefined,
      config:       normConfig(subRaw)    || undefined,
      furnishing:   normFurnishing(furnRaw) || undefined,
      status:       normStatus(statRaw)   || undefined,
      rent:         normRent(rentRaw)     ?? undefined,
      realtor_name: 'Danat Qatar',
    };

    if (zone)      record.zone      = zone;
    if (zone_code) record.zone_code = zone_code;

    // Strip undefined values to match Claude extraction output shape
    for (const k of Object.keys(record)) {
      if (record[k] === undefined) delete record[k];
    }

    results.push(record);
  }

  return results;
}
