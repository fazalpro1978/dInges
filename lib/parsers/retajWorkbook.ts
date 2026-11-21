// lib/parsers/retajWorkbook.ts
// Master + detail workbooks: a master sheet lists buildings and, for some, a pointer cell ("NEXT PAGE (LA-CRYSTAL LIST)")
// meaning "the units are on another sheet". This reader follows those pointers, reads each detail sheet, and joins the
// building-level facts held only on the master (area, security phone, photos, furnishing, bills, building number) onto the units.
// Units that already exist in REIMS under another naming system (Retaj's own Unit_IDs such as QS016_A105) are handed over under
// their existing names so the standard matching sees an update, never a duplicate.

import * as xlsx from 'xlsx';
import { normFurnishing, normBills } from './normalisers';
import { at, txt, linkOf, parseConfig, resolveAreaZone, findHeader as findMasterHeader, isRetajVacantSheet, parseRetajVacant, type Cell } from './retajVacant';
import { isRetajBlockListSheet, parseRetajBlockList } from './retajBlockList';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const tidy = (s: string) => s.replace(/\bREATJ\b/gi, 'RETAJ').replace(/\s+/g, ' ').replace(/\s+\)/g, ')').trim();

// ── Master profiles (building-level facts) ──────────────────────────────────
export type MasterProfile = {
  name: string; key: string; num: string; area: string; furnishing: string; bills: string;
  phone: string; photos?: string; map?: string;
};
type Pointer = { text: string; rowName: string };

function readMaster(ws: xlsx.WorkSheet): { profiles: MasterProfile[]; pointers: Pointer[] } {
  const header = findMasterHeader(ws);
  if (!header) return { profiles: [], pointers: [] };
  const { col } = header;
  const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1');
  for (const m of (ws['!merges'] ?? []) as xlsx.Range[]) {
    const tl = at(ws, m.s.r, m.s.c);
    if (!tl) continue;
    for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) {
      if ((r !== m.s.r || c !== m.s.c) && !at(ws, r, c)) ws[xlsx.utils.encode_cell({ r, c })] = { ...tl };
    }
  }
  const carry: Record<string, Cell | undefined> = {};
  const profiles: MasterProfile[] = [];
  const pointers: Pointer[] = [];
  let lastBlock = '';
  for (let r = header.row + 1; r <= range.e.r; r++) {
    const unitsText = txt(at(ws, r, col.units));
    if (/booked but not finish|^not available/i.test(unitsText)) break;
    const blockId = txt(at(ws, r, col.name - 1));
    if (blockId !== '' && !isNaN(Number(blockId)) && blockId !== lastBlock) { lastBlock = blockId; Object.keys(carry).forEach(k => delete carry[k]); }
    for (const k of ['name', 'num', 'furn', 'bills', 'map', 'area', 'phone', 'photos'] as const) {
      const c = at(ws, r, col[k]);
      if (c && txt(c)) carry[k] = c;
    }
    const own = at(ws, r, col.name);
    if (own && txt(own)) {
      const phone = txt(carry.phone);
      profiles.push({
        name: tidy(txt(own)), key: norm(txt(own)), num: txt(carry.num), area: txt(carry.area),
        furnishing: normFurnishing(txt(carry.furn)), bills: txt(carry.bills),
        phone: /\d{6,}/.test(phone) ? phone : '', photos: linkOf(carry.photos), map: linkOf(carry.map),
      });
    }
    if (/^next page/i.test(unitsText)) pointers.push({ text: unitsText, rowName: txt(at(ws, r, col.name)) });
  }
  return { profiles, pointers };
}

// A pointer names its target in brackets, or (bare "NEXT PAGE") the building on its own row does.
function resolvePointerSheet(p: Pointer, sheets: string[]): string | undefined {
  const STOP = new Set(['list', 'page', 'next', 'retaj', 'the']);
  const tokens = (s: string) => (s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter(t => !STOP.has(t));
  const inParens = /\(([^)]+)\)/.exec(p.text)?.[1] ?? '';
  const want = tokens(inParens || p.rowName);
  let best: { name: string; score: number } | undefined;
  for (const name of sheets) {
    const have = tokens(name);
    const score = want.filter(t => have.some(h => h === t || h.slice(0, 4) === t.slice(0, 4))).length;
    if (score > 0 && (!best || score > best.score)) best = { name, score };
  }
  return best?.name;
}

// ── Detail sheets ───────────────────────────────────────────────────────────
type DetailUnit = Record<string, unknown>;

const SYN: Record<string, RegExp> = {
  unit: /^unit(e|\s*no\.?|\s*id)?$/i, type: /^(type|tyep)$/i, furn: /ff\s*&?\s*uf|furnish/i, price: /^price$/i,
  withBills: /with\s*bills/i, offer: /^(special\s*)?offer$/i, status: /^status$/i, agent: /^agent$/i, bills: /^bills?$/i,
  loc: /^location/i, bno: /bu[a-z]*ing\s*(no|num)/i, building: /^bu[a-z]*ing$/i,
};

function readSimpleDetail(ws: xlsx.WorkSheet, profiles: MasterProfile[]): DetailUnit[] {
  const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1');
  let hdr = -1; const col: Record<string, number> = {};
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 15) && hdr < 0; r++) {
    const found: Record<string, number> = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const t = txt(at(ws, r, c));
      if (!t) continue;
      for (const k of Object.keys(SYN)) if (found[k] === undefined && SYN[k].test(t) && !(k === 'building' && SYN.bno.test(t))) { found[k] = c; break; }
    }
    if (found.unit !== undefined && found.type !== undefined && found.price !== undefined) { hdr = r; Object.assign(col, found); }
  }
  if (hdr < 0) return [];
  for (const m of (ws['!merges'] ?? []) as xlsx.Range[]) {
    const tl = at(ws, m.s.r, m.s.c);
    if (!tl) continue;
    for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) {
      if ((r !== m.s.r || c !== m.s.c) && !at(ws, r, c)) ws[xlsx.utils.encode_cell({ r, c })] = { ...tl };
    }
  }
  let title = '';
  for (let r = range.s.r; r < hdr && !title; r++) for (let c = range.s.c; c <= range.e.c && !title; c++) title = txt(at(ws, r, c));
  title = tidy(title);
  const titleArea = /\(([^)]{2,})\)/.exec(title)?.[1] ?? '';
  const isJeera = /jerr?a|jeera|tca/i.test(title);

  const out: DetailUnit[] = [];
  let building = '';
  let sheetBills = '';
  for (let r = hdr + 1; r <= range.e.r; r++) {
    const b = col.building !== undefined ? txt(at(ws, r, col.building)) : '';
    if (b) building = b;
    const billsHere = col.bills !== undefined ? txt(at(ws, r, col.bills)) : '';
    if (billsHere) sheetBills = billsHere;
    const unitCell = at(ws, r, col.unit);
    const unitText = txt(unitCell);
    if (!unitText || /^x$/i.test(unitText) || unitText === '.') continue;
    const typeText = txt(at(ws, r, col.type));
    const cfg = parseConfig(typeText);
    if (cfg.shop || !cfg.config && cfg.type === 'Apartment') continue;

    // Which master profile describes this unit?
    const jBlock = isJeera ? Number(/^J(\d+)\s*-/i.exec(unitText)?.[1]) : NaN;
    let profile: MasterProfile | undefined;
    if (isJeera && Number.isFinite(jBlock)) {
      profile = profiles.filter(p => /jeer|jerr|tca/i.test(p.name)).find(p => {
        const m = /(\d+)\s*-\s*(\d+)/.exec(p.num);
        return m ? jBlock >= Number(m[1]) && jBlock <= Number(m[2]) : false;
      });
    } else {
      const wanted = [norm(building), norm(title)].filter(Boolean);
      profile = profiles.find(p => wanted.some(w => w === p.key || (w.length > 6 && (p.key.includes(w) || w.includes(p.key)))));
    }

    let property: string;
    if (building) property = /alwaab/i.test(title) && /^W\d+$/i.test(building) ? `${title} ${building}` : tidy(building);
    else property = isJeera && profile ? profile.name : title.replace(/\s*\(.*\)\s*$/, '') || profile?.name || '';
    if (!property) continue;

    const furnRaw = col.furn !== undefined ? txt(at(ws, r, col.furn)) : '';
    let furnishing = /^(un|un-?f)$/i.test(furnRaw) ? 'Unfurnished' : normFurnishing(furnRaw);
    if (!['Fully Furnished', 'Semi-Furnished', 'Unfurnished'].includes(furnishing)) furnishing = profile?.furnishing ?? '';

    const bills = normBills(billsHere || sheetBills || profile?.bills || '');
    const offerText = col.offer !== undefined ? txt(at(ws, r, col.offer)) : '';
    const mf = /(\d+(?:\.\d+)?)\s*(?:m|months?)?\s*(?:mf|free)/i.exec(offerText);
    const price = Number(txt(at(ws, r, col.price)).replace(/[^\d.]/g, '')) || undefined;
    const withBills = col.withBills !== undefined ? Number(txt(at(ws, r, col.withBills)).replace(/[^\d.]/g, '')) : 0;
    const statusText = [col.status, col.agent].map(c => (c === undefined ? '' : txt(at(ws, r, c)))).join(' ');
    const bno = (col.bno !== undefined ? txt(at(ws, r, col.bno)) : '') || (isJeera && Number.isFinite(jBlock) ? `J${jBlock}` : '') || profile?.num || '';
    const area = profile?.area || titleArea;
    const zone_code = area ? resolveAreaZone(area) : undefined;
    const remarks: string[] = [];
    if (withBills && withBills !== price) remarks.push(`Price including bills: ${withBills.toLocaleString('en-US')}`);

    const u: DetailUnit = { property, unit_no: unitText, type: cfg.type, listing_type: 'Rent', status: /book/i.test(statusText) ? 'Reserved' : 'Available' };
    if (cfg.config) u.config = cfg.config;
    if (furnishing) u.furnishing = furnishing;
    if (price !== undefined) u.rent = price;
    if (cfg.amenities.length) u.amenities = cfg.amenities;
    if (mf) { u.month_free_applicable = true; u.month_free_days = Number(mf[1]); }
    if (bills) { u.kahramaa_applicable = bills.kahramaa_applicable; u.water_electricity = bills.water_electricity; }
    if (zone_code !== undefined) { u.zone_code = zone_code; u.zone_source = area; } else if (area) u.zone = area;
    if (profile?.phone) u.contact_details = profile.phone;
    if (profile?.photos) u.media_url = profile.photos;
    const link = (col.loc !== undefined ? linkOf(at(ws, r, col.loc)) : undefined) ?? profile?.map;
    if (link) u.location_map_url = link;
    if (bno) u.maintenance_notes = `Building No. ${bno}`;
    if (remarks.length) u.operator_remarks = remarks.join(' · ');
    out.push(u);
  }
  return out;
}

// ── Cross-naming identity (Retaj Unit_IDs vs plain unit numbers) ─────────────
export function familyKey(property: string, unitNo: string): { fam: string; b: string; digits: string } | null {
  const digits = /(\d{3,4})$/.exec(String(unitNo).trim())?.[1];
  if (!digits) return null;
  const p = property.toLowerCase();
  if (/crystal/.test(p)) return { fam: 'crystal', b: 'x', digits };
  if (/jeer|jerr|tca/.test(p)) {
    const m = /^J(\d+)\s*-/i.exec(unitNo) ?? /QJR0*(\d+)_/i.exec(unitNo);
    return m ? { fam: 'jeera', b: m[1], digits } : null;
  }
  if (/waab/.test(p)) { const m = /W\s*-?\s*(\d)\s*$/i.exec(property); return m ? { fam: 'alwaab', b: m[1], digits } : null; }
  if (/shaheen/.test(p)) { const m = /(\d)\s*$/.exec(property.trim()); return m ? { fam: 'alshaheen', b: m[1], digits } : null; }
  return null;
}

export type ExistingRow = { property: string; unit_no: string; rent?: number | null; status?: string | null; furnishing?: string | null };
export type Match = { property: string; unit_no: string; existing_property: string; existing_unit_no: string; existing_rent: number | null; incoming_rent: number | null; incoming_status: string; changes: string[]; existing_duplicate: boolean };

export function reconcileDetail(detail: DetailUnit[], existing: ExistingRow[]): { units: DetailUnit[]; matches: Match[]; fresh: number; ambiguous: number } {
  const byKey = new Map<string, ExistingRow[]>();
  const labels = new Map<string, Map<string, number>>();
  existing.forEach(e => {
    const k = familyKey(e.property, e.unit_no);
    if (!k) return;
    const key = `${k.fam}|${k.b}|${k.digits}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(e);
    for (const lk of [`${k.fam}|${k.b}`, `${k.fam}|*`]) {
      const m = labels.get(lk) ?? labels.set(lk, new Map()).get(lk)!;
      m.set(e.property, (m.get(e.property) ?? 0) + 1);
    }
  });
  const topLabel = (lk: string): string | undefined => {
    const m = labels.get(lk);
    if (!m) return undefined;
    let best: string | undefined; let n = 0;
    m.forEach((count, label) => { if (count > n) { best = label; n = count; } });
    return lk.endsWith('|*') && m.size > 1 ? undefined : best;
  };
  // A building with no existing label of its own adopts the sibling pattern ("AL SHAHEEN-" + n) so one building keeps one name.
  const derive = (fam: string, b: string): string | undefined => {
    const m = labels.get(`${fam}|*`);
    if (!m) return undefined;
    const prefixes = new Set<string>();
    m.forEach((_n, label) => { if (/\d+\s*$/.test(label)) prefixes.add(label.replace(/\d+\s*$/, '')); });
    return prefixes.size === 1 && fam !== 'crystal' && fam !== 'jeera' ? `${Array.from(prefixes)[0]}${b}` : undefined;
  };
  const matches: Match[] = [];
  let fresh = 0, ambiguous = 0;
  const units = detail.map(u => {
    const k = familyKey(String(u.property), String(u.unit_no));
    if (!k) { fresh++; return u; }
    const hit = byKey.get(`${k.fam}|${k.b}|${k.digits}`) ?? [];
    const label = topLabel(`${k.fam}|${k.b}`) ?? topLabel(`${k.fam}|*`) ?? derive(k.fam, k.b);
    const sameIdentity = hit.length > 1 && hit.every(h => h.property === hit[0].property && h.unit_no === hit[0].unit_no);
    if (hit.length === 1 || sameIdentity) {
      const e = hit[0];
      const changes: string[] = [];
      if (u.rent != null && Number(e.rent) !== Number(u.rent)) changes.push(`rent ${e.rent ?? '—'} → ${u.rent}`);
      if (u.status && e.status && String(e.status) !== String(u.status)) changes.push(`status ${e.status} → ${u.status}`);
      if (u.furnishing && e.furnishing && u.furnishing !== e.furnishing) changes.push(`furnishing ${e.furnishing} → ${u.furnishing}`);
      matches.push({ property: String(u.property), unit_no: String(u.unit_no), existing_property: e.property, existing_unit_no: e.unit_no,
        existing_rent: e.rent == null ? null : Number(e.rent), incoming_rent: u.rent == null ? null : Number(u.rent), incoming_status: String(u.status), changes, existing_duplicate: sameIdentity });
      return { ...u, property: e.property, unit_no: e.unit_no };
    }
    if (hit.length > 1) {
      ambiguous++;
      const note = 'Matches several existing REIMS units — please verify before importing';
      return { ...u, ...(label ? { property: label } : {}), operator_remarks: [String(u.operator_remarks ?? ''), note].filter(Boolean).join(' · ') };
    }
    fresh++;
    return label ? { ...u, property: label } : u;
  });
  return { units, matches, fresh, ambiguous };
}

// Master units that are already in REIMS and unchanged (status, rent, furnishing) are not offered again.
export function dropCurrent(master: DetailUnit[], existing: ExistingRow[]): { units: DetailUnit[]; current: number } {
  const n = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const idx = new Map<string, ExistingRow>();
  existing.forEach(e => idx.set(`${n(e.property)}||${n(e.unit_no)}`, e));
  let current = 0;
  const units = master.filter(u => {
    const e = idx.get(`${n(u.property)}||${n(u.unit_no)}`);
    if (!e) return true;
    const same = (u.status == null || String(u.status) === String(e.status ?? ''))
      && (u.rent == null || Number(u.rent) === Number(e.rent))
      && (u.furnishing == null || String(u.furnishing) === String(e.furnishing ?? ''));
    if (same) { current++; return false; }
    return true;
  });
  return { units, current };
}

// ── Entry points ────────────────────────────────────────────────────────────
export type WorkbookParse = { master: DetailUnit[]; detail: DetailUnit[]; sheets: { sheet: string; units: number }[]; masterSheet: string };

export function parseRetajWorkbook(wb: xlsx.WorkBook, zoneNames: Map<number, string>, hidden: Set<string | undefined>): WorkbookParse | null {
  const visible = wb.SheetNames.filter(n => !hidden.has(n));
  const masterSheet = visible.find(n => isRetajVacantSheet(n, wb.Sheets[n]));
  if (!masterSheet) return null;
  const { profiles, pointers } = readMaster(wb.Sheets[masterSheet]);
  const targets: string[] = [];
  pointers.forEach(p => {
    const t = resolvePointerSheet(p, visible.filter(n => n !== masterSheet));
    if (t && targets.indexOf(t) < 0) targets.push(t);
  });
  if (!targets.length) return null;

  const detail: DetailUnit[] = [];
  const sheets: { sheet: string; units: number }[] = [];
  for (const name of targets) {
    const ws = wb.Sheets[name];
    let units: DetailUnit[];
    if (isRetajBlockListSheet(name, ws)) {
      units = parseRetajBlockList(ws, zoneNames).map(u => {
        const p = profiles.find(x => x.key === norm(String(u.property)));
        return { ...u, ...(p?.phone ? { contact_details: p.phone } : {}), ...(p?.photos ? { media_url: p.photos } : {}) };
      });
    } else {
      units = readSimpleDetail(ws, profiles);
    }
    units = units.map(u => (u.zone_code != null && zoneNames.get(Number(u.zone_code)) ? { ...u, zone: zoneNames.get(Number(u.zone_code)) } : u));
    sheets.push({ sheet: name.trim(), units: units.length });
    detail.push(...units);
  }
  return { master: parseRetajVacant(wb.Sheets[masterSheet], zoneNames), detail, sheets, masterSheet: masterSheet.trim() };
}
