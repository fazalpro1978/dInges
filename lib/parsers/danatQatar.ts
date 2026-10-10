// lib/parsers/danatQatar.ts
// Dedicated pre-processor for the Danat Qatar realtor XLSX template.
// Runs as a source-specific layer BEFORE the standard pipeline — importSchema.ts,
// castAndValidateField, cr_assign_smart_code and cr_generate_master_code are untouched.
//
// Template signature: "Units Import" sheet, 15 columns, rows 2–118+
// Realtor: Danat Qatar (Alfardan Gardens / Majduleen Gardens, Doha)
//
// Zone lookup: queries cr_zone_codes from the Code Registry (shared Supabase project).
// Fuzzy-matches Area/Location text against district_name; leaves zone_code null if
// no match — operator fills it in the Validation stage.

import * as xlsx from 'xlsx';
import { registry } from '../registryClient';

// ── Column indices (0-based) ────────────────────────────────────────────────
const COL = {
  property:      0,   // Property Name *
  unit_no:       1,   // Property Unit No *
  // zone_number: 2 → always blank in this template
  area_location: 3,   // Area / Location → zone (text) + zone_code (derived)
  type:          4,   // Property Type *
  subtype:       5,   // Property Subtype * → config  (BHK format: "4 BHK")
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

// ── Zone lookup from Code Registry ─────────────────────────────────────────
// Normalise a string to lowercase alpha-numeric tokens for fuzzy comparison.
function normStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

type ZoneRow = { zone_code: number; district_name: string };

async function loadZones(): Promise<ZoneRow[]> {
  const { data } = await registry
    .from('cr_zone_codes')
    .select('zone_code, district_name')
    .order('zone_code');
  return (data ?? []) as ZoneRow[];
}

function resolveZoneFromList(
  areaText: string,
  zones: ZoneRow[],
): { zone: string; zone_code: number | undefined } {
  const zone = areaText.trim();
  if (!zone) return { zone: '', zone_code: undefined };

  const normArea = normStr(zone);

  for (const z of zones) {
    const normDistrict = normStr(z.district_name);
    // Full substring match in either direction
    if (normArea.includes(normDistrict) || normDistrict.includes(normArea)) {
      return { zone, zone_code: z.zone_code };
    }
    // All words of the district name appear in the area text (handles minor re-ordering)
    const words = normDistrict.split(' ').filter(Boolean);
    if (words.length >= 2 && words.every(w => normArea.includes(w))) {
      return { zone, zone_code: z.zone_code };
    }
  }

  return { zone, zone_code: undefined };
}

// ── Normalisation helpers ───────────────────────────────────────────────────

function normStatus(raw: string): string {
  switch (raw.trim().toLowerCase()) {
    case 'available':         return 'Available';
    case 'vacant':            return 'Available';      // Danat Qatar PDF term
    case 'upcoming':          return 'Under_Maintenance'; // confirmed rule
    case 'leased':            return 'Leased';
    case 'reserved':          return 'Reserved';
    case 'under_maintenance': return 'Under_Maintenance';
    default:                  return raw.trim();
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
  if (s === 'ROWHOUSE')                                  return 'Rowhouse';
  return raw.trim();
}

// Handles both BHK ("4 BHK") and BR ("4 BR") formats, and extracts
// amenities + design_type from qualifiers embedded in the subtype column.
function parseSubtype(raw: string): {
  config: string;
  type_override?: string;
  amenities: string[];
  design_type?: string;
} {
  let s = raw.trim();
  const amenities: string[] = [];
  let design_type: string | undefined;
  let type_override: string | undefined;

  // ── Type qualifiers that override the property type ─────────────────────
  if (/\browhouse\b/i.test(s)) {
    type_override = 'Rowhouse';
    s = s.replace(/\browhouse\b/i, '').trim();
  }
  if (/\bvilla\b/i.test(s)) {
    type_override = 'Villa';
    s = s.replace(/\bvilla\b/i, '').trim();
  }

  // ── Amenity qualifiers ──────────────────────────────────────────────────
  if (/large\s*(by|backyard|b\.?y\.?)/i.test(s)) {
    amenities.push('Large Backyard');
    s = s.replace(/large\s*(by|backyard|b\.?y\.?)/i, '').trim();
  }
  if (/(with\s+small\s+backyard|small\s*(by|backyard)|standard\s*(by|backyard))/i.test(s)) {
    amenities.push('Small Backyard');
    s = s.replace(/(with\s+small\s+backyard|small\s*(by|backyard)|standard\s*(by|backyard))/i, '').trim();
  }
  if (/(with\s*pool|w\/\s*pool|large\s*sp)/i.test(s)) {
    amenities.push('Private Pool');
    s = s.replace(/(with\s*pool|w\/\s*pool|large\s*sp)/i, '').trim();
  }

  // ── Design-type qualifiers (in parentheses or suffix) ──────────────────
  const parenMatch = s.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const q = parenMatch[1].trim();
    const lower = q.toLowerCase();
    if (lower === 'standard')          design_type = 'Standard';
    else if (lower === 'medium')       design_type = 'Medium';
    else if (lower === 'no backyard')  design_type = 'No Backyard';
    else                               design_type = q;
    s = s.replace(/\([^)]+\)/, '').trim();
  }

  // "Type A", "Type B", etc.
  const typeLetterMatch = s.match(/\btype\s+([A-Z])\b/i);
  if (typeLetterMatch) {
    design_type = `Type ${typeLetterMatch[1].toUpperCase()}`;
    s = s.replace(/\btype\s+[A-Z]\b/i, '').trim();
  }

  // ── BHK / BR count → canonical "N BHK" ────────────────────────────────
  s = s.replace(/[-]+$/, '').trim(); // strip trailing dashes
  const m = s.match(/^(\d+)\s*(BHK|BR)\b/i);
  const config = m ? `${m[1]} BHK` : s.trim();

  return { config, type_override, amenities, design_type };
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

export function isDanatQatarSheet(sheetName: string, ws: xlsx.WorkSheet): boolean {
  const name = sheetName.toLowerCase().replace(/\s+/g, ' ').trim();
  if (name !== 'units import') return false;

  const h0 = cellStr(ws, 0, COL.property).toLowerCase();
  const h5 = cellStr(ws, 0, COL.subtype).toLowerCase();
  const h3 = cellStr(ws, 0, COL.area_location).toLowerCase();

  return h0.includes('property name') && h5.includes('subtype') && h3.includes('area');
}

// ── Main extractor (async — queries Code Registry for zone codes) ───────────

export async function parseDanatQatar(ws: xlsx.WorkSheet): Promise<Record<string, unknown>[]> {
  const zones = await loadZones();
  const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1');
  const results: Record<string, unknown>[] = [];

  for (let r = 1; r <= range.e.r; r++) {
    const property = cellStr(ws, r, COL.property);
    const unit_no  = cellStr(ws, r, COL.unit_no);

    if (!property || !unit_no) continue;
    if (/^(total|sub[\s-]?total)/i.test(property)) continue;

    const areaRaw  = cellStr(ws, r, COL.area_location);
    const typeRaw  = cellStr(ws, r, COL.type);
    const subRaw   = cellStr(ws, r, COL.subtype);
    const furnRaw  = cellStr(ws, r, COL.furnishing);
    const statRaw  = cellStr(ws, r, COL.status);
    const rentRaw  = cellRaw(ws, r, COL.rent);

    const { zone, zone_code } = resolveZoneFromList(areaRaw, zones);
    const { config, type_override, amenities, design_type } = parseSubtype(subRaw);

    const resolvedType = normType(type_override ?? typeRaw);
    const record: Record<string, unknown> = {
      property,
      unit_no,
      type:         resolvedType   || undefined,
      config:       config         || undefined,
      furnishing:   normFurnishing(furnRaw) || undefined,
      status:       normStatus(statRaw)    || undefined,
      rent:         normRent(rentRaw)      ?? undefined,
      realtor_name: 'Danat Qatar',
    };

    if (zone)                      record.zone       = zone;
    if (zone_code !== undefined)   record.zone_code  = zone_code;
    if (amenities.length > 0)      record.amenities  = amenities;
    if (design_type)               record.design_type = design_type;

    for (const k of Object.keys(record)) {
      if (record[k] === undefined) delete record[k];
    }

    results.push(record);
  }

  return results;
}
