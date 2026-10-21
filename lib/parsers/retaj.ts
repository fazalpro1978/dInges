// lib/parsers/retaj.ts
// Pre-processor for the AXIOM Standard Import Template pre-filled by Retaj Properties.
//
// Template signature: "Units Import" sheet, 14 columns.
// Detection key: col 2 = "Zone Number *" (Danat Qatar has "Area / Location" at col 3).
// Zone codes are already populated in the template — no registry lookup needed.
// Normalises subtype format (2BHK → 2 BHK), casing, and status values only.

import * as xlsx from 'xlsx';
import { cellStr, cellRaw, normStatus, normFurnishing, normType, normConfig, normRent } from './normalisers';

// ── Column indices (0-based) ────────────────────────────────────────────────
const COL = {
  property:   0,  // Property Name *
  unit_no:    1,  // Property Unit No *
  zone_code:  2,  // Zone Number *
  type:       3,  // Property Type *
  config:     4,  // Property Subtype * → config
  furnishing: 5,  // Furnishing Status *
  bathrooms:  6,  // Bathrooms
  kitchen:    7,  // Kitchen
  parking:    8,  // Parking
  rent:       9,  // Rent (QAR / Monthly)
  status:    10,  // Status
  map_url:   11,  // Map URL
  media_url: 12,  // Media Storage URL
  realtor:   13,  // Realtor Name
} as const;

function normZoneCode(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || String(raw).trim() === '') return undefined;
  const n = parseInt(String(raw), 10);
  return isNaN(n) ? undefined : n;
}

// ── Template detection ──────────────────────────────────────────────────────
// Sheet name = "Units Import" (same as Danat Qatar).
// Retaj: col 2 header contains "zone"; col 3 header contains "type".
// Danat Qatar: col 3 header contains "area" / "location".

export function isRetajSheet(sheetName: string, ws: xlsx.WorkSheet): boolean {
  const name = sheetName.toLowerCase().replace(/\s+/g, ' ').trim();
  if (name !== 'units import') return false;

  const h0 = cellStr(ws, 0, COL.property).toLowerCase();
  const h2 = cellStr(ws, 0, COL.zone_code).toLowerCase();
  const h3 = cellStr(ws, 0, COL.type).toLowerCase();

  return (
    h0.includes('property name') &&
    h2.includes('zone') &&
    (h3.includes('property type') || h3.includes('type'))
  );
}

// ── Main extractor (synchronous — zone codes embedded in template) ──────────

export function parseRetaj(ws: xlsx.WorkSheet): Record<string, unknown>[] {
  const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1');
  const results: Record<string, unknown>[] = [];

  for (let r = 1; r <= range.e.r; r++) {
    const property = cellStr(ws, r, COL.property);
    const unit_no  = cellStr(ws, r, COL.unit_no);

    if (!property || !unit_no) continue;
    // Skip hint/instruction rows
    if (/^(total|sub[\s-]?total|instructions?|hints?|\d+\.\s)/i.test(property)) continue;

    const zoneRaw    = cellRaw(ws, r, COL.zone_code);
    const typeRaw    = cellStr(ws, r, COL.type);
    const configRaw  = cellStr(ws, r, COL.config);
    const furnRaw    = cellStr(ws, r, COL.furnishing);
    const bathRaw    = cellRaw(ws, r, COL.bathrooms);
    const kitRaw     = cellStr(ws, r, COL.kitchen);
    const parkRaw    = cellRaw(ws, r, COL.parking);
    const rentRaw    = cellRaw(ws, r, COL.rent);
    const statRaw    = cellStr(ws, r, COL.status);
    const mapRaw     = cellStr(ws, r, COL.map_url);
    const mediaRaw   = cellStr(ws, r, COL.media_url);
    const realtorRaw = cellStr(ws, r, COL.realtor);

    const zone_code  = normZoneCode(zoneRaw);
    const furnishing = normFurnishing(furnRaw);
    const config     = normConfig(configRaw);
    const bathrooms  = bathRaw ? (Number(bathRaw) || undefined) : undefined;
    const parking    = parkRaw ? (Number(parkRaw) || undefined) : undefined;

    const record: Record<string, unknown> = {
      property,
      unit_no,
      type:         normType(typeRaw)   || undefined,
      config:       config              || undefined,
      furnishing:   furnishing          || undefined,
      status:       normStatus(statRaw) || undefined,
      rent:         normRent(rentRaw)   ?? undefined,
      realtor_name: realtorRaw          || 'Retaj',
    };

    if (zone_code !== undefined) record.zone_code        = zone_code;
    if (bathrooms !== undefined) record.bathrooms        = bathrooms;
    if (kitRaw)                  record.kitchen          = kitRaw;
    if (parking !== undefined)   record.parking          = parking;
    if (mapRaw)                  record.location_map_url = mapRaw;
    if (mediaRaw)                record.media_url        = mediaRaw;

    // Remove undefined keys
    for (const k of Object.keys(record)) {
      if (record[k] === undefined) delete record[k];
    }

    results.push(record);
  }

  return results;
}
