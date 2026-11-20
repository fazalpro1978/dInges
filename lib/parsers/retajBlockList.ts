// lib/parsers/retajBlockList.ts
// Retaj's per-building block list (e.g. "ALSHAHEEN ( ALNASER )"): columns BUILDING / UNIT NO. / PRICE / TYPE / BILLS / OFFER /
// AGENT / STATUS / LOCATION / BUILDING NO., one merged block per building, units one per row.
// Same confirmed Retaj rules as retajVacant.ts; differences handled here:
//  - blocks are found from the merged cells (a unit row can lack the building name of its own)
//  - the area comes from the sheet title in brackets, e.g. "( ALNASER )"
//  - "TYPE" carries config and furnishing together ("2BHK - FF")
//  - BOOKED can sit under either the AGENT or STATUS column (headers are swapped in the source)
//  - red font marks shared labels here, NOT unit numbers, so it is ignored

import * as xlsx from 'xlsx';
import { normFurnishing, normBills } from './normalisers';
import { at, txt, parseConfig, linkOf, unitTokens, resolveAreaZone, type Cell } from './retajVacant';

type Cols = { name: number; num?: number; unit: number; price: number; type: number; bills?: number; offer?: number; loc?: number; agent?: number; status?: number };

function findHeader(ws: xlsx.WorkSheet): { row: number; col: Cols } | null {
  const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 15); r++) {
    const c: Partial<Cols> = {};
    for (let col = range.s.c; col <= range.e.c; col++) {
      const t = txt(at(ws, r, col)).toLowerCase();
      if (!t) continue;
      if (/^bu[a-z]*ing\s*no/.test(t)) c.num ??= col;
      else if (/^bu[a-z]*ing\s*$/.test(t)) c.name ??= col;
      else if (/^unit\s*no/.test(t)) c.unit ??= col;
      else if (/^price/.test(t)) c.price ??= col;
      else if (/^type$/.test(t)) c.type ??= col;
      else if (/^bills/.test(t)) c.bills ??= col;
      else if (/^offer/.test(t)) c.offer ??= col;
      else if (/^location/.test(t)) c.loc ??= col;
      else if (/^agent/.test(t)) c.agent ??= col;
      else if (/^status/.test(t)) c.status ??= col;
    }
    if (c.name !== undefined && c.unit !== undefined && c.price !== undefined && c.type !== undefined && c.bills !== undefined && c.offer !== undefined) {
      return { row: r, col: c as Cols };
    }
  }
  return null;
}

export function isRetajBlockListSheet(_name: string, ws: xlsx.WorkSheet): boolean {
  return findHeader(ws) !== null;
}

export function parseRetajBlockList(ws: xlsx.WorkSheet, zoneNames: Map<number, string> = new Map()): Record<string, unknown>[] {
  const header = findHeader(ws);
  if (!header) return [];
  const { col } = header;
  const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1');
  const merges = (ws['!merges'] ?? []) as xlsx.Range[];

  // Block id of a row = top row of the merged building-level cells (building no. / location / bills / offer) containing it.
  const anchorCols = [col.num, col.loc, col.bills, col.offer].filter((c): c is number => c !== undefined);
  const blockTop = (r: number): number => {
    let top = r;
    for (const c of anchorCols) {
      const m = merges.find(x => x.s.c <= c && x.e.c >= c && x.s.r <= r && x.e.r >= r);
      if (m) top = Math.min(top, m.s.r);
    }
    return top;
  };

  // Propagate merged values so every row of a block sees the shared fields.
  for (const m of merges) {
    const tl = at(ws, m.s.r, m.s.c);
    if (!tl) continue;
    for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) {
      if ((r !== m.s.r || c !== m.s.c) && !at(ws, r, c)) ws[xlsx.utils.encode_cell({ r, c })] = { ...tl };
    }
  }

  // Area from the sheet title, e.g. "ALSHAHEEN ( ALNASER )"
  let area = '';
  for (let r = range.s.r; r < header.row && !area; r++) {
    for (let c = range.s.c; c <= range.e.c && !area; c++) area = /\(([^)]{2,})\)/.exec(txt(at(ws, r, c)))?.[1].trim() ?? '';
  }
  const zone_code = area ? resolveAreaZone(area) : undefined;

  // Block attributes: first non-empty value among the block's rows
  const blocks = new Map<number, number[]>();
  for (let r = header.row + 1; r <= range.e.r; r++) {
    const top = blockTop(r);
    (blocks.get(top) ?? blocks.set(top, []).get(top)!).push(r);
  }
  const firstOf = (rows: number[], c: number | undefined): Cell | undefined => {
    if (c === undefined) return undefined;
    for (const r of rows) { const cell = at(ws, r, c); if (cell && txt(cell)) return cell; }
    return undefined;
  };

  const units: Record<string, unknown>[] = [];
  blocks.forEach((rows) => {
    const property = txt(firstOf(rows, col.name));
    if (!property) return;
    const typeText = txt(firstOf(rows, col.type));
    const cfg = parseConfig(typeText);
    if (cfg.shop || (!cfg.config && cfg.type === 'Apartment')) return;
    const bills = normBills(txt(firstOf(rows, col.bills)));
    const offer = txt(firstOf(rows, col.offer));
    const mf = /(\d+(?:\.\d+)?)\s*(?:months?\s*free|mf)/i.exec(offer);
    const buildingNo = txt(firstOf(rows, col.num));
    const map = linkOf(firstOf(rows, col.loc));
    let furnishing = '';
    for (const tok of typeText.split(/[-–+]/)) {
      const f = normFurnishing(tok.trim());
      if (['Fully Furnished', 'Semi-Furnished', 'Unfurnished'].includes(f)) furnishing = f;
    }
    const type = cfg.type === 'Apartment' && /villa/i.test(property) ? 'Villa' : cfg.type;

    for (const r of rows) {
      const unitCell = at(ws, r, col.unit);
      const unitText = txt(unitCell);
      if (!unitText || /^x$/i.test(unitText) || unitText === '.' || /^next page/i.test(unitText)) continue;
      const rentText = txt(at(ws, r, col.price));
      const remarks: string[] = [];
      let rent: number | undefined;
      if (/\d\s*[-–]\s*\d/.test(rentText)) remarks.push(`Rent range provided: ${rentText.replace(/\s*[-–]\s*/, ' - ')} — enter rent manually`);
      else { const n = Number(rentText.replace(/[^\d.]/g, '')); if (n > 0) rent = n; }
      const booked = [col.agent, col.status].some(c => c !== undefined && /book/i.test(txt(at(ws, r, c))));

      for (const { no } of unitTokens(unitCell)) {
        const u: Record<string, unknown> = { property, unit_no: no, type, listing_type: 'Rent', status: booked ? 'Reserved' : 'Available' };
        if (cfg.config) u.config = cfg.config;
        if (furnishing) u.furnishing = furnishing;
        if (rent !== undefined) u.rent = rent;
        if (cfg.amenities.length) u.amenities = cfg.amenities;
        if (mf) { u.month_free_applicable = true; u.month_free_days = Number(mf[1]); }
        if (bills) { u.kahramaa_applicable = bills.kahramaa_applicable; u.water_electricity = bills.water_electricity; }
        if (zone_code !== undefined) { u.zone_code = zone_code; u.zone = zoneNames.get(zone_code) ?? area; if (area && u.zone !== area) u.zone_source = area; }
        else if (area) u.zone = area;
        if (buildingNo) u.maintenance_notes = `Building No. ${buildingNo}`;
        if (map) u.location_map_url = map;
        if (remarks.length) u.operator_remarks = remarks.join(' · ');
        units.push(u);
      }
    }
  });
  return units;
}
