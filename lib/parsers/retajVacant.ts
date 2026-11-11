// lib/parsers/retajVacant.ts
// Deterministic parser for Retaj Properties' freeform "VACANT LIST" workbook (block layout:
// building-level fields on the first row of a merged block, one row per unit type below it).
// Rules confirmed by the user on 2026-11-10 — see project memory "retaj_vacant_list".

import * as xlsx from 'xlsx';
import { normFurnishing } from './normalisers';

type Cell = xlsx.CellObject & { r?: string; l?: { Target?: string } };
const at = (ws: xlsx.WorkSheet, r: number, c: number) => ws[xlsx.utils.encode_cell({ r, c })] as Cell | undefined;
const txt = (cell?: Cell) => String(cell?.v ?? '').replace(/\s+/g, ' ').trim();

const HEADER_KEYS = {
  name: /bu?i?ld?ing name/i, num: /bu?i?ld?ing num/i, type: /unit type/i, units: /units available/i,
  price: /^price/i, furn: /^status/i, bills: /^bills/i, kind: /the kind/i, map: /^location/i,
  area: /^area/i, phone: /security num/i, photos: /^photos/i,
} as const;
type Key = keyof typeof HEADER_KEYS;

function findHeader(ws: xlsx.WorkSheet): { row: number; col: Record<Key, number> } | null {
  const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 12); r++) {
    const col: Partial<Record<Key, number>> = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const t = txt(at(ws, r, c));
      for (const k of Object.keys(HEADER_KEYS) as Key[]) if (col[k] === undefined && HEADER_KEYS[k].test(t)) col[k] = c;
    }
    if (col.name !== undefined && col.type !== undefined && col.units !== undefined && col.price !== undefined) {
      return { row: r, col: col as Record<Key, number> };
    }
  }
  return null;
}

export function isRetajVacantSheet(_name: string, ws: xlsx.WorkSheet): boolean {
  return findHeader(ws) !== null;
}

// Area text → zone_code. Only unambiguous areas are resolved; the registry has several codes for
// some districts (Al Sadd 38/39, Musheireb 3/4/13) so those are left for the user in Match & Review.
const AREA_ZONE: Array<[RegExp, number]> = [
  [/^al ?sadd$/i, 38], [/^al ?naser$|^al ?nasr$/i, 39], [/umm ?ghu?wailina/i, 27], [/old ?air ?port|old arport/i, 45],
  [/^lusail$/i, 69], [/al ?ghrafa|al ?gharrafa/i, 51], [/^al ?waab$/i, 55], [/abo ?hamour|abu ?hamour/i, 55],
  [/al ?masilla|al ?messila/i, 36], [/bin ?omran/i, 37], [/fareej ?kulaib|fereej ?kulaib/i, 35], [/old ?sala[t]?a/i, 18],
];

type Run = { text: string; red: boolean };
function runsOf(cell: Cell | undefined): Run[] {
  const raw = cell?.r;
  const full = String(cell?.v ?? '');
  if (!raw || !raw.includes('<r>')) return [{ text: full, red: false }];
  const runs: Run[] = [];
  for (const m of raw.matchAll(/<r>([\s\S]*?)<\/r>/g)) {
    const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(m[1])?.[1] ?? '';
    runs.push({ text: t.replace(/&amp;/g, '&'), red: /<color rgb="FFFF0000"/i.test(m[1]) });
  }
  return runs.length ? runs : [{ text: full, red: false }];
}

// Split a dash-joined unit-number cell into tokens, flagging tokens that contain a red character.
function unitTokens(cell: Cell | undefined): Array<{ no: string; red: boolean }> {
  const runs = runsOf(cell);
  const chars: Array<{ ch: string; red: boolean }> = [];
  for (const r of runs) for (const ch of r.text) chars.push({ ch, red: r.red });
  const out: Array<{ no: string; red: boolean }> = [];
  let cur = '', red = false;
  const flush = () => { const no = cur.trim(); if (no) out.push({ no, red }); cur = ''; red = false; };
  for (const { ch, red: isRed } of chars) {
    if (ch === '-') { flush(); continue; }
    cur += ch;
    if (isRed && ch.trim()) red = true;
  }
  flush();
  return out;
}

function parseConfig(raw: string): { config?: string; type: string; amenities: string[]; shop: boolean } {
  const s = raw.toLowerCase();
  const amenities: string[] = [];
  if (s.includes('shop')) return { type: 'Shop', amenities, shop: true };
  if (/\+\s*maid/.test(s)) amenities.push('Maids Room');
  if (/\+\s*store/.test(s)) amenities.push('Store Room');
  if (/bal+a?c?o?ny/.test(s)) amenities.push('Balcony');
  const bhk = /(\d+)\s*(?:bhk|br)\b/.exec(s);
  if (bhk) return { config: `${bhk[1]} BHK`, type: Number(bhk[1]) >= 4 ? 'Villa' : 'Apartment', amenities, shop: false };
  if (/studio/.test(s)) return { config: 'Studio', type: 'Studio', amenities, shop: false };
  if (/du[bp]l?e?x/.test(s)) return { config: 'Duplex', type: 'Duplex', amenities, shop: false };
  return { type: 'Apartment', amenities, shop: false };
}

function defaultBathrooms(config?: string): number | undefined {
  if (!config) return undefined;
  if (config === 'Studio') return 1.5;
  if (config === 'Duplex') return 2.5;
  const n = Number(/^(\d+) BHK$/.exec(config)?.[1]);
  if (!n) return undefined;
  return n === 1 ? 1 : n === 2 ? 1.5 : n === 3 ? 2.5 : n === 4 ? 3.5 : 4;
}

const isHttp = (s: string) => /^https?:\/\//i.test(s);
const linkOf = (cell?: Cell): string | undefined => {
  const v = String(cell?.v ?? '').trim();
  const t = cell?.l?.Target?.trim() ?? '';
  return isHttp(v) ? v : isHttp(t) ? t : undefined;
};

export function parseRetajVacant(ws: xlsx.WorkSheet, zoneNames: Map<number, string> = new Map()): Record<string, unknown>[] {
  const header = findHeader(ws);
  if (!header) return [];
  const { col } = header;
  const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1');
  const blockCol = col.name - 1; // column D: building sequence number

  // Propagate merged values so every row of a block sees the building-level fields.
  for (const m of (ws['!merges'] ?? []) as xlsx.Range[]) {
    const tl = at(ws, m.s.r, m.s.c);
    if (!tl) continue;
    for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) {
      if ((r !== m.s.r || c !== m.s.c) && !at(ws, r, c)) ws[xlsx.utils.encode_cell({ r, c })] = { ...tl };
    }
  }

  const carry: Partial<Record<Key, Cell>> = {};
  let lastBlock = '';
  const units: Record<string, unknown>[] = [];

  for (let r = header.row + 1; r <= range.e.r; r++) {
    const unitsCell = at(ws, r, col.units);
    if (/booked but not finish|^not available/i.test(txt(unitsCell))) break; // legend footer

    const block = at(ws, r, blockCol);
    const blockId = String(block?.v ?? '').trim();
    if (blockId !== '' && !isNaN(Number(blockId)) && blockId !== lastBlock) {
      lastBlock = blockId;
      for (const k of Object.keys(carry) as Key[]) delete carry[k];
    }
    for (const k of ['name', 'num', 'furn', 'bills', 'kind', 'map', 'area', 'phone', 'photos'] as Key[]) {
      const c = at(ws, r, col[k]);
      if (c && txt(c)) carry[k] = c;
    }

    const typeRaw = txt(at(ws, r, col.type));
    const priceCell = at(ws, r, col.price);
    if (!typeRaw || !unitsCell || !carry.name) continue;

    const unitsText = txt(unitsCell);
    if (!unitsText || /^x$/i.test(unitsText) || /^next page/i.test(unitsText) || unitsText === '.') continue;

    const cfg = parseConfig(typeRaw);
    if (cfg.shop || (!cfg.config && cfg.type === 'Apartment')) continue; // shop rows + unreadable unit types (e.g. stray merged text)
    if (cfg.type === 'Apartment' && /villa/i.test(txt(carry.name))) cfg.type = 'Villa';

    const remarks: string[] = [];
    if (/sta+f/i.test(txt(carry.kind))) remarks.push('STAFF ONLY');

    // Rent: single number → rent; any range → blank + range noted for manual entry
    const priceText = txt(priceCell);
    let rent: number | undefined;
    let monthFree: number | undefined;
    const mf = /(\d+(?:\.\d+)?)\s*(?:mf|months?\s*free)/i.exec(priceText);
    if (mf) monthFree = Number(mf[1]);
    const priceCore = priceText.replace(/\+?\s*\d+(?:\.\d+)?\s*(?:mf|months?\s*free)/i, '').trim();
    if (/\d\s*[-–]\s*\d/.test(priceCore)) remarks.push(`Rent range provided: ${priceCore.replace(/\s*[-–]\s*/, ' - ')} — enter rent manually`);
    else { const n = Number(priceCore.replace(/[^\d.]/g, '')); if (n > 0) rent = n; }

    // Bills → Kahramaa / water & electricity
    const bills = txt(carry.bills).toUpperCase();
    let kahramaa: boolean | undefined;
    let waterElec: string | undefined;
    if (/^NOT\s*INC/.test(bills)) { kahramaa = true; waterElec = 'Excluded'; }
    else if (/INC/.test(bills))   { kahramaa = false; waterElec = 'Included'; }

    // Defaults for fields the file never provides, each flagged for cross-checking
    const bathrooms = defaultBathrooms(cfg.config);
    if (bathrooms !== undefined) remarks.push('Bathroom Details Not Provided, Please Cross Check');
    remarks.push('Parking Details Not Provided, Please Cross Check', 'Kitchen Details Not Provided, Please Cross Check');

    const area = txt(carry.area);
    const zone_code = AREA_ZONE.find(([re]) => re.test(area))?.[1];
    const phone = txt(carry.phone);
    const furnishing = normFurnishing(txt(carry.furn));
    const propertyName = txt(carry.name);
    const buildingNo = txt(carry.num);
    const map = linkOf(carry.map);
    const photos = linkOf(carry.photos);

    for (const { no, red } of unitTokens(unitsCell)) {
      const u: Record<string, unknown> = {
        property: propertyName,
        unit_no: no,
        type: cfg.type,
        listing_type: 'Rent',
        status: red ? 'Reserved' : 'Available',
        parking: 'Yes',
        kitchen: 'Yes',
        operator_remarks: remarks.join(' · '),
      };
      if (cfg.config) u.config = cfg.config;
      if (['Fully Furnished', 'Semi-Furnished', 'Unfurnished'].includes(furnishing)) u.furnishing = furnishing;
      if (rent !== undefined) u.rent = rent;
      if (bathrooms !== undefined) u.bathrooms = bathrooms;
      if (cfg.amenities.length) u.amenities = cfg.amenities;
      if (monthFree !== undefined) { u.month_free_applicable = true; u.month_free_days = monthFree; }
      if (kahramaa !== undefined) { u.kahramaa_applicable = kahramaa; u.water_electricity = waterElec; }
      if (zone_code !== undefined) {
        u.zone_code = zone_code;
        u.zone = zoneNames.get(zone_code) ?? area;
        if (area && u.zone !== area) u.zone_source = area;
      }
      else if (area) u.zone = area;
      if (/\d{6,}/.test(phone)) u.contact_details = phone;
      if (buildingNo) u.maintenance_notes = `Building No. ${buildingNo}`;
      if (map) u.location_map_url = map;
      if (photos) u.media_url = photos;
      units.push(u);
    }
  }
  return units;
}
