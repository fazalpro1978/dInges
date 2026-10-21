// lib/parsers/cap.ts
// Deterministic parser for the CAP Properties Qatar vacant list format.
//
// Template signature: any sheet name except "Units Import"; 16 columns;
// each property group has its own mini-header row (col 0 = "Property").
// Real unit rows are identified by a parenthetical CAP code: "Flat # 109 (CAP120 DJ)".
//
// Zone codes: resolved via Code Registry fuzzy match on Location text.
// All units are status=Available (this is a vacant list).

import * as xlsx from 'xlsx';
import { registry } from '../registryClient';
import { cellStr, cellRaw, normType, normFurnishing, normRent } from './normalisers';

// ── Column indices (0-based) ────────────────────────────────────────────────
const COL = {
  property:    0,  // "Flat # {unit_no} ({property_code} {area_code})"
  location:    1,  // District/area text → zone_code lookup
  type:        2,  // Flat, Office, Studio, etc.
  description: 3,  // "(Furnishing) - N Bedroom - N.N Bathroom\nHall - Kitchen - Parking"
  rent:        4,  // Monthly rent QAR
  deposit:     5,  // Security deposit
  kahramaa:    6,  // Kahramaa deposit "QAR 2,000 Cash / Dated-Cheque"
  contract_fee: 7, // Contract processing charge → operator_remarks
  utilities:   8,  // "Including Water & Electricity" etc.
  amenities:   9,  // Gym, pool, pickle ball court, etc.
  photos:     10,  // Cell label "PHOTOS" with hyperlink = media_url
  contact:    11,  // Contact person → operator_remarks
  kahramaa_limit: 12, // "QR 150 per month" → water_electricity_limit_amount
  commission: 13,  // Commission → operator_remarks
  start_date: 14,  // Availability/start date → notes
  booking_validity: 15, // Booking validity period → notes
} as const;

// ── Zone lookup ─────────────────────────────────────────────────────────────

function normStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

type ZoneRow = { zone_code: number; district_name: string };

async function loadZones(): Promise<ZoneRow[]> {
  const { data } = await registry.from('cr_zone_codes').select('zone_code, district_name').order('zone_code');
  return (data ?? []) as ZoneRow[];
}

function resolveZone(text: string, zones: ZoneRow[]): { zone: string; zone_code?: number } {
  const zone = text.trim();
  if (!zone) return { zone: '' };
  const norm = normStr(zone);
  for (const z of zones) {
    const nd = normStr(z.district_name);
    if (norm.includes(nd) || nd.includes(norm)) return { zone, zone_code: z.zone_code };
    const words = nd.split(' ').filter(Boolean);
    if (words.length >= 2 && words.every(w => norm.includes(w))) return { zone, zone_code: z.zone_code };
  }
  return { zone };
}

// ── Property column parser ───────────────────────────────────────────────────
// "Flat # 109 (CAP120 DJ)" → { unit_no: "109", property_code: "CAP120" }
// "A 12 (CAP18 LSL)"       → { unit_no: "A 12", property_code: "CAP18" }

function parsePropertyCell(raw: string): { unit_no: string; property_code: string } | null {
  const parenMatch = raw.match(/\(([^)]+)\)/);
  if (!parenMatch) return null;

  const inner = parenMatch[1].trim();
  const capMatch = inner.match(/^(CAP\d+)/i);
  if (!capMatch) return null;

  const property_code = capMatch[1].toUpperCase();
  const unitRaw = raw.replace(/\s*\([^)]*\)/, '').trim();
  const unit_no = unitRaw.replace(/^flat\s*#?\s*/i, '').trim();
  if (!unit_no) return null;

  return { unit_no, property_code };
}

// ── Description parser ───────────────────────────────────────────────────────
// "(Fully Furnished) - 2 Bedroom - 2.0 Bathroom\nHall - Kitchen - One Dedicated Parking"

function parseDescription(raw: string): {
  furnishing?: string;
  config?: string;
  bathrooms?: number;
  kitchen?: string;
  parking?: number;
} {
  const result: ReturnType<typeof parseDescription> = {};

  const furnMatch = raw.match(/\(([^)]+)\)/);
  if (furnMatch) {
    const q = furnMatch[1].trim();
    if (/studio/i.test(q)) {
      result.config = 'Studio';
      if (/furnished/i.test(q)) result.furnishing = 'Fully Furnished';
    } else {
      const f = normFurnishing(q);
      if (f) result.furnishing = f;
    }
  }

  if (!result.config) {
    const bedMatch = raw.match(/(\d+)\s+Bedroom/i);
    if (bedMatch) result.config = `${bedMatch[1]} BHK`;
  }

  const bathMatch = raw.match(/(\d+(?:\.\d+)?)\s+Bathroom/i);
  if (bathMatch) result.bathrooms = Math.floor(parseFloat(bathMatch[1]));

  if (/Hall\s*[-–]\s*Kitchen/i.test(raw) || /Kitchen/i.test(raw)) result.kitchen = 'Open';

  if (/Without\s+Parking/i.test(raw)) result.parking = 0;
  else if (/One\s+Dedicated\s+Parking|With\s+Parking|\bParking\b/i.test(raw)) result.parking = 1;

  return result;
}

// ── Utilities parser ─────────────────────────────────────────────────────────

function parseUtilities(raw: string): {
  water_electricity?: 'Included' | 'Excluded';
  kahramaa_applicable?: boolean;
} {
  const s = raw.toLowerCase();
  if (
    s.includes('including water') || s.includes('including electricity') ||
    s.includes('including all') || s.includes('marafeq') ||
    s.includes('including kahrama')
  ) {
    return { water_electricity: 'Included', kahramaa_applicable: false };
  }
  if (s.includes('excluding') || s.includes('not included') || s.includes('tenant pays')) {
    return { water_electricity: 'Excluded', kahramaa_applicable: true };
  }
  return {};
}

// Parse "QR 150 per month" → 150; "QAR 2,000 Cash..." → 2000

function parseQarAmount(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/(?:QAR|QR)\s*([\d,]+)/i) ?? s.match(/^([\d,]+)/);
  if (m) { const n = parseFloat(m[1].replace(/,/g, '')); return isNaN(n) ? null : n; }
  return normRent(raw);
}

// ── Sheet detection ──────────────────────────────────────────────────────────
// Scan first 15 rows for a mini-header: col 0 = "property", col 1 = "location",
// col 3 = "description". Retaj/Danat Qatar both use "Units Import" — exclude.

export function isCapSheet(sheetName: string, ws: xlsx.WorkSheet): boolean {
  if (sheetName.toLowerCase().replace(/\s+/g, ' ').trim() === 'units import') return false;
  const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1');
  const maxRow = Math.min(range.e.r, 15);
  for (let r = 0; r <= maxRow; r++) {
    const h0 = cellStr(ws, r, 0).toLowerCase();
    const h1 = cellStr(ws, r, 1).toLowerCase();
    const h3 = cellStr(ws, r, 3).toLowerCase();
    if (h0 === 'property' && h1 === 'location' && h3 === 'description') return true;
  }
  return false;
}

// ── Main extractor ───────────────────────────────────────────────────────────

export async function parseCap(ws: xlsx.WorkSheet): Promise<Record<string, unknown>[]> {
  const zones = await loadZones();
  const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1');

  // Expand merged cells so remarks propagate across rows
  type MergeRange = { s: { r: number; c: number }; e: { r: number; c: number } };
  const merges: MergeRange[] = (ws['!merges'] as MergeRange[] | undefined) ?? [];
  for (const merge of merges) {
    const topLeft = ws[xlsx.utils.encode_cell({ r: merge.s.r, c: merge.s.c })] as xlsx.CellObject | undefined;
    if (!topLeft) continue;
    for (let mr = merge.s.r; mr <= merge.e.r; mr++) {
      for (let mc = merge.s.c; mc <= merge.e.c; mc++) {
        if (mr === merge.s.r && mc === merge.s.c) continue;
        const addr = xlsx.utils.encode_cell({ r: mr, c: mc });
        if (!ws[addr]) ws[addr] = { ...topLeft };
      }
    }
  }

  const results: Record<string, unknown>[] = [];

  for (let r = 0; r <= range.e.r; r++) {
    const propRaw = cellStr(ws, r, COL.property);
    if (!propRaw) continue;

    // Skip mini-header rows ("Property") and section labels (no CAP code)
    const parsed = parsePropertyCell(propRaw);
    if (!parsed) continue;

    const { unit_no, property_code } = parsed;

    const locationRaw  = cellStr(ws, r, COL.location);
    const typeRaw      = cellStr(ws, r, COL.type);
    const descRaw      = cellStr(ws, r, COL.description);
    const rentRaw      = cellRaw(ws, r, COL.rent);
    const depositRaw   = cellRaw(ws, r, COL.deposit);
    const kahDepRaw    = cellRaw(ws, r, COL.kahramaa);
    const utilitiesRaw = cellStr(ws, r, COL.utilities);
    const amenitiesRaw = cellStr(ws, r, COL.amenities);
    const limitRaw     = cellStr(ws, r, COL.kahramaa_limit);
    const contactRaw   = cellStr(ws, r, COL.contact);
    const commissionRaw = cellStr(ws, r, COL.commission);

    // Extract media_url from hyperlink behind the PHOTOS cell
    const photosCell = ws[xlsx.utils.encode_cell({ r, c: COL.photos })] as
      (xlsx.CellObject & { l?: { Target?: string } }) | undefined;
    const media_url = photosCell?.l?.Target || undefined;

    const { zone, zone_code } = resolveZone(locationRaw, zones);
    const desc  = parseDescription(descRaw);
    const utils = parseUtilities(utilitiesRaw);

    const remarkParts: string[] = [];
    if (commissionRaw) remarkParts.push(`Commission: ${commissionRaw}`);
    if (contactRaw) remarkParts.push(contactRaw);
    const operator_remarks = remarkParts.length ? remarkParts.join(' · ') : undefined;

    const amenities = amenitiesRaw
      ? amenitiesRaw.split(/[,;]/).map(a => a.trim()).filter(Boolean)
      : undefined;

    const limitAmt = parseQarAmount(limitRaw);

    const record: Record<string, unknown> = {
      property:     property_code,
      unit_no,
      status:       'Available',
      realtor_name: 'CAP Properties',
    };

    const type = normType(typeRaw);
    if (type)                               record.type      = type;
    if (zone)                               record.zone      = zone;
    if (zone_code !== undefined)            record.zone_code = zone_code;
    if (desc.config)                        record.config    = desc.config;
    if (desc.furnishing)                    record.furnishing = desc.furnishing;
    if (desc.bathrooms !== undefined)       record.bathrooms = desc.bathrooms;
    if (desc.kitchen)                       record.kitchen   = desc.kitchen;
    if (desc.parking !== undefined)         record.parking   = desc.parking;
    const rent = normRent(rentRaw);
    if (rent !== null)                      record.rent      = rent;
    const deposit = parseQarAmount(depositRaw);
    if (deposit !== null)                   record.deposit_amount = deposit;
    const kahDep = parseQarAmount(kahDepRaw);
    if (kahDep !== null)                    record.kahramaa_amount = kahDep;
    if (utils.water_electricity)            record.water_electricity = utils.water_electricity;
    if (utils.kahramaa_applicable !== undefined) record.kahramaa_applicable = utils.kahramaa_applicable;
    if (limitAmt !== null) {
      record.water_electricity_limit_applicable = true;
      record.water_electricity_limit_amount = limitAmt;
    }
    if (amenities?.length)                  record.amenities = amenities;
    if (media_url)                          record.media_url = media_url;
    if (operator_remarks)                   record.operator_remarks = operator_remarks;

    for (const k of Object.keys(record)) {
      if (record[k] === undefined) delete record[k];
    }

    results.push(record);
  }

  return results;
}
