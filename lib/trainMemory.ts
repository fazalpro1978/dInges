// lib/trainMemory.ts
// AXIOM "train memory": the data-ingestion rules the business has confirmed, each tied to the code that enforces it.
// Human-readable detail lives in /train_memory/*.md. `npm run check:train-memory` fails if a rule points at a file that
// no longer exists, so training cannot silently drift away from the code.
//
// Paths are relative to the AXIOM repo; a "reims:" prefix means the REIMS repo (prive-reims).

export type Rule = {
  id: string;
  rule: string;
  decidedOn: string;      // YYYY-MM-DD the business confirmed it
  enforcedBy: string[];   // files that implement it
};

export type SourceProfile = {
  id: string;
  name: string;
  handler: 'parser' | 'canonical-sheet' | 'ai-prompt';
  detect: string;         // how AXIOM recognises this source
  doc: string;            // train_memory/*.md
  rules: Rule[];
};

export const GLOBAL_RULES: Rule[] = [
  { id: 'G01', decidedOn: '2026-11-10', enforcedBy: ['lib/parsers/normalisers.ts', 'app/api/extract/route.ts'],
    rule: 'Fields a file never provides get defaults, each with a "<Field> Details Not Provided, Please Cross Check" remark: bathrooms by bedrooms (1 BHK 1, 2 BHK 1.5, 3 BHK 2.5, 4 BHK 3.5, 5+ 4, Studio 1.5, Duplex 2.5), parking Yes, kitchen Yes. Commercial types skipped. Kill switch: AXIOM_MISSING_FIELD_DEFAULTS=off.' },
  { id: 'G02', decidedOn: '2026-11-10', enforcedBy: ['lib/parsers/normalisers.ts', 'app/api/extract/route.ts'],
    rule: 'Bills wording: NOT INC / EXCLUDING -> kahramaa_applicable true + water_electricity Excluded; any INC wording (INC, INC., INCLUDING ALL, INCLUDING KAHRAMA ONLY, INC W & E) -> false + Included.' },
  { id: 'G03', decidedOn: '2026-11-10', enforcedBy: ['app/api/extract/route.ts', 'lib/parsers/retajVacant.ts'],
    rule: 'A rent given as a range is never guessed: rent stays blank and "Rent range provided: low - high — enter rent manually" goes to operator_remarks.' },
  { id: 'G04', decidedOn: '2026-11-11', enforcedBy: ['app/api/extract/route.ts'],
    rule: 'Lists with a quantity and no unit numbers expand to one unit per quantity, numbered TBC-01, TBC-02… per property (sequence continues across rows). Standard default, not an open item (reconfirmed 2026-11-20).' },
  { id: 'G05', decidedOn: '2026-11-20', enforcedBy: ['app/api/extract/route.ts', 'reims:app/api/ingest/apply/route.ts'],
    rule: 'Agency commission only where the source states it: one week\'s rent = monthly rent / 4, Paid By "Real Estate Company", written to REIMS unit_commissions. Where the source mentions none, leave blank for the end user.' },
  { id: 'G06', decidedOn: '2026-11-11', enforcedBy: ['reims:app/api/ingest/apply/route.ts'],
    rule: 'Free months: AXIOM carries a month COUNT (1, 1.5, 2); REIMS stores integer DAYS, so counts up to 12 are multiplied by 30 on import.' },
  { id: 'G07', decidedOn: '2026-11-11', enforcedBy: ['components/IngestPipeline.tsx', 'components/MasterCodePanel.tsx', 'app/api/master-code/check/route.ts'],
    rule: 'Multi-zone batches: one 8-character Master Code prefix per real zone; Check Registry (prefix + unit-level duplicates) runs per prefix; Generate Master Codes is gated on that check. ?legacyPrefix=1 restores the single-prefix panel.' },
  { id: 'G08', decidedOn: '2026-11-11', enforcedBy: ['components/IngestPipeline.tsx'],
    rule: 'Choices held only in the screen (zone per property, realtor) are written onto every record at Generate; sending to REIMS is blocked for any record missing a smart code, a realtor, or a zone matching its Master Code.' },
  { id: 'G09', decidedOn: '2026-11-11', enforcedBy: ['supabase/migrations/20261111_smart_code_security_definer.sql'],
    rule: 'cr_assign_smart_code must stay SECURITY DEFINER; CREATE OR REPLACE FUNCTION resets security attributes and otherwise blocks all new smart codes.' },
  { id: 'G10', decidedOn: '2026-11-11', enforcedBy: ['supabase/migrations/20261111_master_code_overrides.sql', 'app/api/master-code/log-override/route.ts'],
    rule: 'Override reasons (min 10 characters) are logged to cr_master_code_overrides, never to the unrelated cr_code_overrides.' },
  { id: 'G11', decidedOn: '2026-11-11', enforcedBy: ['app/api/extract/route.ts'],
    rule: 'A record with a zone_code but no zone name receives the registry district name; the original file text is kept in zone_source.' },
  { id: 'G12', decidedOn: '2026-11-10', enforcedBy: ['app/api/extract/route.ts'],
    rule: 'Furnishing is never inferred. Maid / "+1" suffix -> Maids Room, "+Store" -> Store Room, unit-level notes such as "staff only" go to operator_remarks.' },
  { id: 'G14', decidedOn: '2026-11-10', enforcedBy: ['app/api/extract/route.ts'],
    rule: 'Hidden sheets are never read — neither by the trained parsers nor by the AI path (confirmed for the Retaj workbook\'s hidden Inovia sheet, applied to every file).' },
  { id: 'G15', decidedOn: '2026-11-21', enforcedBy: ['lib/parsers/normalisers.ts', 'app/api/extract/route.ts'],
    rule: 'A unit listed twice in one file is imported once when the rows are identical; rows that share property + unit number but differ are kept and flagged "Duplicate unit number in source file — please verify". Nothing is dropped unless it is an exact copy.' },
  { id: 'G16', decidedOn: '2026-11-21', enforcedBy: ['lib/parsers/retajWorkbook.ts', 'app/api/extract/route.ts', 'components/IngestPipeline.tsx'],
    rule: 'Master + detail workbooks: a pointer cell on the master ("NEXT PAGE (SHEET)") is followed to its detail sheet; unit-level facts (unit number, price, offer, status) come from the detail sheet, building-level facts (area, phone, photos, map, furnishing, bills, building number) from the master. Units already in REIMS under another identifier are handed over under their existing property and unit names so the unchanged matching engine sees updates, never duplicates; master rows already current in REIMS are not offered again. The result is shown on Match & Review.' },
  { id: 'G13', decidedOn: '2026-11-11', enforcedBy: ['lib/parsers/canonical.ts', 'app/api/extract/route.ts'],
    rule: 'A sheet whose headers are AXIOM field names is read exactly as written (no AI); master and smart codes in it are ignored and always regenerated.' },
];

export const SOURCE_PROFILES: SourceProfile[] = [
  {
    id: 'retaj-vacant-list', name: 'Retaj Properties vacant list', handler: 'parser',
    detect: 'Header row containing Building Name, Unit Type, Units Available and price (hidden sheets skipped)',
    doc: 'train_memory/sources/retaj-vacant-list.md',
    rules: [
      { id: 'RET01', decidedOn: '2026-11-10', enforcedBy: ['lib/parsers/retajVacant.ts'], rule: 'Building-level fields sit on the first merged row of a block and carry down; dash-joined unit numbers expand to one unit each.' },
      { id: 'RET02', decidedOn: '2026-11-10', enforcedBy: ['lib/parsers/retajVacant.ts'], rule: 'Units marked "X" import nothing; "NEXT PAGE" rows are skipped; SHOP rows are dropped; the hidden Inovia sheet is ignored.' },
      { id: 'RET03', decidedOn: '2026-11-10', enforcedBy: ['lib/parsers/retajVacant.ts'], rule: 'A red-font unit number inside a cell becomes status Reserved for that unit only; a red "X" alone is ignored.' },
      { id: 'RET04', decidedOn: '2026-11-10', enforcedBy: ['lib/parsers/retajVacant.ts'], rule: 'Config: 3bhk / 2 BR -> N BHK, STUDIO -> Studio, DUBLEX -> Duplex; "(small/big/medium)" ignored; +MAID / +STORE / +BALCONY become amenities. FF / UF / SF -> Fully / Unfurnished / Semi-Furnished.' },
      { id: 'RET05', decidedOn: '2026-11-10', enforcedBy: ['lib/parsers/retajVacant.ts'], rule: 'Building number -> maintenance_notes "Building No. N"; "staff only" kind -> imported with operator_remarks STAFF ONLY; security phone -> contact_details (imported units only); realtor left blank to be chosen in AXIOM.' },
      { id: 'RET06', decidedOn: '2026-11-10', enforcedBy: ['lib/parsers/retajVacant.ts'], rule: 'Areas resolve to a zone only when unambiguous (alsadd 38, alnaser 39, …); Corniche, Mushirab and buildings with no area are chosen in Match & Review.' },
    ],
  },
  {
    id: 'retaj-block-list', name: 'Retaj per-building block list', handler: 'parser',
    detect: 'Header row with Building, Unit No., Price, Type, Bills and Offer (e.g. the Alshaheen / Al Naser list); hidden sheets skipped',
    doc: 'train_memory/sources/retaj-block-list.md',
    rules: [
      { id: 'RBL01', decidedOn: '2026-11-21', enforcedBy: ['lib/parsers/retajBlockList.ts'], rule: 'Blocks are found from the merged building-level cells; a unit row without its own building name belongs to the block it is merged with.' },
      { id: 'RBL02', decidedOn: '2026-11-21', enforcedBy: ['lib/parsers/retajBlockList.ts'], rule: 'TYPE carries config and furnishing together ("2BHK - FF"); OFFER "1 MONTH FREE" sets month free (count, REIMS stores days); BILLS follows global rule G02; building number goes to maintenance_notes.' },
      { id: 'RBL03', decidedOn: '2026-11-21', enforcedBy: ['lib/parsers/retajBlockList.ts'], rule: 'BOOKED under either the AGENT or STATUS column (the source headers are swapped) means Reserved; red font marks shared labels in this layout and is ignored; "X" units import nothing.' },
      { id: 'RBL04', decidedOn: '2026-11-21', enforcedBy: ['lib/parsers/retajBlockList.ts', 'lib/parsers/retajVacant.ts'], rule: 'The area comes from the sheet title in brackets (e.g. "( ALNASER )") and resolves to a zone only when unambiguous (alnaser 39); a map link is used only where the location cell has one.' },
    ],
  },
  {
    id: 'retaj-workbook', name: 'Retaj master workbook with detail sheets', handler: 'parser',
    detect: 'A visible master sheet (Retaj vacant-list headers) whose NEXT PAGE cells resolve to visible detail sheets',
    doc: 'train_memory/sources/retaj-workbook.md',
    rules: [
      { id: 'RWB01', decidedOn: '2026-11-21', enforcedBy: ['lib/parsers/retajWorkbook.ts'], rule: 'Only sheets the master points to are read (La Crystal, Alshaheen, Jeera/TCA, Alwaab in the first workbook); unreferenced sheets such as La Rose and Commercial are left alone until the user asks for them.' },
      { id: 'RWB02', decidedOn: '2026-11-21', enforcedBy: ['lib/parsers/retajWorkbook.ts'], rule: 'Join keys: building number (Alshaheen, Alwaab), building name (La Crystal), block range of the unit prefix (Jeera J1-J10 and J30-J40). Alwaab WITH BILLS price goes to a remark; rent is the price excluding bills.' },
      { id: 'RWB03', decidedOn: '2026-11-21', enforcedBy: ['lib/parsers/retajWorkbook.ts'], rule: 'Existing REIMS units under Retaj\'s own Unit_ID naming (QS016_A105) match incoming units by building plus the last digits of the unit number; matches are handed over under the existing names, ambiguous ones are flagged, and identical existing copies are reported.' },
      { id: 'RWB04', decidedOn: '2026-11-21', enforcedBy: ['lib/parsers/retajWorkbook.ts'], rule: 'New units in a building with existing units adopt that building\'s existing label pattern (AL SHAHEEN-n, RETAJ WEST ALWAAB W-n).' },
      { id: 'RWB06', decidedOn: '2026-11-21', enforcedBy: ['lib/parsers/retajWorkbook.ts', 'app/api/extract/route.ts'], rule: 'When REIMS already holds units of a building, the zone those units carry wins over a zone guessed from the area name. Jeera/TCA is zone 56 in Retaj\'s own data and in REIMS even though "Abu Hamour" appears in zone 55\'s name.' },
      { id: 'RWB07', decidedOn: '2026-11-21', enforcedBy: ['lib/parsers/retajWorkbook.ts'], rule: 'Where a matched unit\'s config or type in the file differs from REIMS, the report lists it. The matching step keeps the existing config/type (additive), so the person confirms in Validation; five Jeera units and Alwaab W2-101 were 2 BHK in REIMS but 1 BHK in the Nov 2026 list.' },
      { id: 'RWB05', decidedOn: '2026-11-21', enforcedBy: ['lib/parsers/retajWorkbook.ts', 'app/api/extract/route.ts'], rule: 'Master units already current in REIMS (status, rent, furnishing unchanged) are not offered again. Realtor "Retaj Real Estate" and entity RET apply (the older 148-unit import used "Retaj" and RNL).' },
    ],
  },
  {
    id: 'ramaco-availability-list', name: 'Ramaco availability list (image)', handler: 'canonical-sheet',
    detect: 'Image goes through the AI prompt rules; a corrected sheet with AXIOM field names is read by the canonical reader',
    doc: 'train_memory/sources/ramaco-availability-list.md',
    rules: [
      { id: 'RAM01', decidedOn: '2026-11-11', enforcedBy: ['app/api/extract/route.ts'], rule: 'Quantity rows expand to TBC-nn units (see G04). "2BR+1" / "4BR+1" -> N BHK plus Maids Room. Restaurant table ignored.' },
      { id: 'RAM02', decidedOn: '2026-11-11', enforcedBy: ['app/api/extract/route.ts'], rule: 'NO INCLUSIONS -> Excluded / kahramaa true; "Electricity and Water Included" -> Included / false; "Free Shared Internet" -> WiFi; stated lease or minimum term -> legal_duration (e.g. "2 years").' },
      { id: 'RAM03', decidedOn: '2026-11-20', enforcedBy: ['app/api/extract/route.ts', 'reims:app/api/ingest/apply/route.ts'], rule: 'One-week commission applies to the tables that state it (flats, others); the villa table states none, so it stays blank for the end user.' },
      { id: 'RAM04', decidedOn: '2026-11-11', enforcedBy: ['lib/parsers/canonical.ts'], rule: 'Y Village 01 flats and villas are separate units; furnishing is left blank where the table does not state it.' },
    ],
  },
  {
    id: 'cap-vacant-list', name: 'CAP Properties vacant list', handler: 'parser',
    detect: 'Single sheet, 16 fixed columns with repeating mini-headers',
    doc: 'train_memory/sources/cap-vacant-list.md',
    rules: [
      { id: 'CAP01', decidedOn: '2026-10-21', enforcedBy: ['lib/parsers/cap.ts'], rule: 'Property column = unit number plus a CAPxxx property code; Description carries bedrooms, furnishing, bathrooms and parking; Utilities wording sets water_electricity and kahramaa_applicable.' },
    ],
  },
  {
    id: 'danat-qatar-template', name: 'Danat Qatar XLSX template', handler: 'parser',
    detect: 'Sheet "Units Import" with an Area / Location column',
    doc: 'train_memory/sources/danat-qatar.md',
    rules: [
      { id: 'DAN01', decidedOn: '2026-10-10', enforcedBy: ['lib/parsers/danatQatar.ts'], rule: 'Status Available -> Available, Upcoming -> Under_Maintenance; zone code derived from Area / Location; realtor Danat Qatar.' },
    ],
  },
];

// Which trained profile handled a file, reported by /api/extract so batches show their provenance.
export const HANDLER_PROFILE: Record<string, { id: string; name: string }> = {
  'canonical-sheet':    { id: 'canonical-sheet',    name: 'AXIOM field-name sheet (read exactly as written)' },
  'retaj-vacant-list':  { id: 'retaj-vacant-list',  name: 'Retaj Properties vacant list' },
  'retaj-block-list':   { id: 'retaj-block-list',   name: 'Retaj per-building block list' },
  'retaj-workbook':     { id: 'retaj-workbook',     name: 'Retaj master workbook with detail sheets' },
  'retaj-template':     { id: 'retaj-template',     name: 'Retaj "Units Import" template' },
  'danat-qatar-template': { id: 'danat-qatar-template', name: 'Danat Qatar XLSX template' },
  'cap-vacant-list':    { id: 'cap-vacant-list',    name: 'CAP Properties vacant list' },
  'ai-schema-prompt':   { id: 'ai-schema-prompt',   name: 'AI extraction with the trained rule prompt' },
};
