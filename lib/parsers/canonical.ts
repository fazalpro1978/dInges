// lib/parsers/canonical.ts
// Reader for a sheet whose header row uses AXIOM's own payload field names (property, unit_no, config, rent, …).
// Lets a corrected / pre-structured dataset be loaded exactly as written — no AI interpretation.
// Detection: row 1 has `property` + `unit_no` + `config` and at least 5 other recognised keys.
// Master/smart codes are never read: they are always (re)generated in Match & Review.

import * as xlsx from 'xlsx';

const NUMERIC = new Set([
  'zone_code', 'bathrooms', 'rent', 'rent_ff', 'service_charges', 'deposit_amount', 'agency_fee', 'size_sqm', 'floor',
  'month_free_days', 'kahramaa_amount', 'water_electricity_limit_amount', 'qatar_cool_amount', 'marafeq_amount',
  'booking_fee', 'agency_fee_amount', 'area_sqft',
]);
const BOOLEAN = new Set([
  'month_free_applicable', 'pro_rata_applicable', 'kahramaa_applicable', 'water_electricity_limit_applicable',
  'qatar_cool_applicable', 'marafeq_applicable', 'agency_fee_applicable',
]);
const ARRAY = new Set(['amenities', 'view_types']);

const KNOWN = new Set([
  'property', 'unit_no', 'zone_code', 'zone', 'type', 'config', 'furnishing', 'bathrooms', 'kitchen', 'parking',
  'rent', 'status', 'listing_type', 'realtor_name', 'realtor_moci', 'location_map_url', 'media_url', 'amenities',
  'operator_remarks', 'maintenance_notes', 'contact_details', 'legal_duration', 'month_free_applicable',
  'month_free_days', 'kahramaa_applicable', 'kahramaa_amount', 'water_electricity', 'water_electricity_limit_applicable',
  'water_electricity_limit_amount', 'service_charges', 'deposit_amount', 'agency_fee', 'agency_fee_applicable',
  'agency_fee_amount', 'agency_fee_paid_by', 'size_sqm', 'floor', 'view', 'design_type', 'notes', 'zone_source',
]);

type Header = { col: number; key: string };

function readHeader(ws: xlsx.WorkSheet): Header[] {
  const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1');
  const out: Header[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const v = ws[xlsx.utils.encode_cell({ r: range.s.r, c })]?.v;
    const key = String(v ?? '').trim().toLowerCase();
    if (key) out.push({ col: c, key });
  }
  return out;
}

export function isCanonicalSheet(_name: string, ws: xlsx.WorkSheet): boolean {
  if (!ws['!ref']) return false;
  const keys = new Set(readHeader(ws).map(h => h.key));
  if (!(keys.has('property') && keys.has('unit_no') && keys.has('config'))) return false;
  return Array.from(keys).filter(k => KNOWN.has(k)).length >= 8;
}

const truthy = (s: string) => ['yes', 'true', '1', 'y'].includes(s.toLowerCase());

export function parseCanonical(ws: xlsx.WorkSheet): Record<string, unknown>[] {
  const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1');
  const header = readHeader(ws).filter(h => KNOWN.has(h.key));
  const units: Record<string, unknown>[] = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const u: Record<string, unknown> = {};
    for (const { col, key } of header) {
      const cell = ws[xlsx.utils.encode_cell({ r, c: col })];
      const raw = cell?.v;
      if (raw === undefined || raw === null || String(raw).trim() === '') continue;
      const s = String(raw).trim();
      if (NUMERIC.has(key)) { const n = Number(s.replace(/,/g, '')); if (Number.isFinite(n)) u[key] = n; }
      else if (BOOLEAN.has(key)) u[key] = typeof raw === 'boolean' ? raw : truthy(s);
      else if (ARRAY.has(key)) u[key] = s.split(/[;|]/).map(x => x.trim()).filter(Boolean);
      else u[key] = s;
    }
    if (u.property && u.unit_no) units.push(u);
  }
  return units;
}
