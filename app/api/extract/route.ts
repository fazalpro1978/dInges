import { NextRequest, NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

const SCHEMA_PROMPT = `You are a real estate data extraction specialist for Qatar property market.
Extract ALL unit/property records from the provided document.

Return ONLY a JSON array of objects. Each object must use these exact field names:
unit_code, property, unit_no, zone, zone_code, type, config, furnishing, kitchen,
status, rent, service_charges, deposit_amount, agency_fee, listing_type,
bedrooms, bathrooms, parking, floor, area_sqft, maid_room, wifi, realtor_name, realtor_moci,
moci_contract_status, moci_contract_number, legal_duration,
contract_start_date, contract_end_date, location_map_url, notes

Normalisation rules:
- property (MANDATORY — every record must have this):
  * COMPOUND UNIT NUMBER FORMAT (common in Qatar leasing sheets): When a "Unit Number" or "Unit No." column contains a compound code like "EARP01-B00-F00-AA02" or "PROJ-B01-F03-C205" — i.e. a string with multiple segments separated by hyphens where one segment starts with "F" followed by digits (the floor) — split it at the LAST hyphen:
      - property = everything before the last hyphen  →  "EARP01-B00-F00"
      - unit_no  = the final segment after the last hyphen  →  "AA02"
  * If the compound code does NOT follow this pattern, use the standard rules below.
  * Standard rules: Look in a dedicated "Property", "Building", "Project", "Tower" column; OR a merged cell / heading above the data table; OR the document title; OR a label like "Property:", "Building:", "Project:" anywhere.
  * Copy the same property name to every unit record that belongs to it.
  * If you cannot find any property name, use the file's title or heading text — never leave it blank.
- unit_no (MANDATORY — every record must have this):
  * If the UNIT NUMBER column is a compound code (see property rule above), unit_no = the last hyphen-delimited segment (e.g. "AA02", "A1708").
  * Otherwise look for any column: "Unit No.", "Apt No.", "Flat No.", "Room", "Room No.", "Suite", "Villa No.", "Office No.", "No.", "Ref.", "#", "SN", "S.N.", "Sl. No.", "Unit ID", "Unit", "APT".
  * Strip area/size notation only: "5- (362 sqm)" → "5". Keep alphanumeric IDs as-is.
  * If the only identifier is a serial/row number (1, 2, 3...), use that number.
  * Never omit this field.
  * COMMA/AMPERSAND MULTI-UNIT EXPANSION (CRITICAL): If a unit_no cell contains multiple flat/unit numbers separated by commas, ampersands (&), or both (e.g. "Flat No. 103,105,106,203,205,303,403,404,405,503,505" or "Flat 7, 15 & 20" or "Flat 12 & 37"), you MUST expand this into SEPARATE individual records — one record per flat/unit number. Every expanded record inherits ALL shared attributes from that row (property, zone, zone_code, type, config, furnishing, rent, status, realtor_name, etc.). For example: "Flat 7, 15 & 20" with rent 5500 → three records: unit_no "Flat 7", unit_no "Flat 15", unit_no "Flat 20", each with rent 5500 and all other fields identical. This is the most important extraction rule — failure to expand means missing records.
- type: Apartment | Villa | Office | Studio
  * Infer from unit_no: "APT." prefix → Apartment; "V"/"VIL" prefix → Villa
  * OFFICE / AL KHOR OFFICE → Office; STUDIO → Studio; bare number → Apartment default
- config: use format "N BHK" (e.g. "2 BHK", "3 BHK"); Studio → "Studio"; Office → "Office"
  * Strip spacing: "2BHK" → "2 BHK"; "1BHK" → "1 BHK"
- furnishing: Furnished | Semi-Furnished | Unfurnished
  * FF / FULLY FURNISHED / LUXURY FULLY FURNISHED / FULLY-FURNISHED → Furnished
  * SF / SEMI-FURNISHED / SEMI FURNISHED → Semi-Furnished
  * UF / UNFURNISHED / UN-FURNISHED → Unfurnished
- status: normalise to one of these exact values:
  * "Available" — READY FOR VIEWING, Vacant, vacant, AVAILABLE
  * "Not Available" — CONTRACT, LEASED, Leased, CONTRACTED
  * "Reserved" — BOOKED, RESERVED
  * "Under Preparation" — UNDER MAINTENANCE, UNDER PREPARATION, UNDER RENOVATION
  * "Awaiting Activation on {dd/mm/yy}" — when a date is present in the status cell; format date as dd/mm/yy (e.g. "Awaiting Activation on 03/07/26")
  * Skip the entire row if a property-level status is "FULL" with no unit data
- listing_type: Rent | Sale
- rent: numbers only, no currency — strip "QAR", "QR", commas, ".00", "/ month", contract term text in parentheses (e.g. "QR 6,000 / month (1 year contract)" → 6000; "QAR 6,500.00" → 6500)
- dates: YYYY-MM-DD format (for contract dates etc.; status dates use dd/mm/yy as above)
- realtor_name: The COMPANY or BROKERAGE name that owns/manages the listing. Look for a dedicated "Company", "Agent", "Broker", "Real Estate" column or the document issuer name (e.g. "Al Emadi Enterprises" from the document header/logo/title). NEVER put a person's first name or watchman/caretaker name here (e.g. "Hussein", "Mohamed", "Azeez" are watchman names — not realtors). If no company name is identifiable, omit realtor_name entirely.
- maid_room: true | false — set true when Room Type / config contains "+Maid" or "Maid" suffix (e.g. "2BR+Maid", "3BR+Maid"). When true, also strip "+Maid" from the config value so config stores only the BHK part (e.g. "2 BHK").
- wifi: true | false — set true when a WIFI / WiFi / Wi-Fi column value is "Yes" or "YES". Set false when "No" or absent.
- area_sqft: numeric size from "Size Sq.", "Size (sqm)", "Area", "Sq.m" column — store the number as-is (label says sqft but we treat it as sqm for Qatar properties).
- floor: numeric floor number from "Floor", "Fl." column — integer only.
- Watchman / Caretaker / Contact column (labelled "Watchman Number", "Watchman No.", "Caretaker", "Contact", "Supervisor" or similar): This is NOT the realtor. Extract as notes in format "Contact: {Name} {Phone}" (e.g. "Contact: Hussein 51838959"). Do NOT put this in realtor_name.
- property: The BUILDING or PROPERTY name — e.g. "C25 Al Waab", "E-A3 Airport", "V35 Meisameer". The "Bldg. Code / Area" or "Building Code" column is the property field. The document issuer name (e.g. "Al Emadi Enterprises") is the REALTOR, not the property. Do not confuse the two.
- Ignore: SN/serial numbers, section sub-headers (e.g. "UPCOMING VACANT APARTMENTS"), row colour banding, logos, footers, marketing text, offer details, BALCONY, VIEW columns, Viewing Time column
- If a field is not present in the source, omit it entirely (do not include null values)
- For multi-column layouts (units side by side), extract each unit as a separate record

Return raw JSON array only. No markdown, no explanation.`;

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function parseUnits(text: string): Record<string, unknown>[] {
  return JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const ext   = file.name.split('.').pop()?.toLowerCase() ?? '';
  const bytes = await file.arrayBuffer();
  const buf   = Buffer.from(bytes);
  const client = getClient();

  try {
    let units: Record<string, unknown>[] = [];

    // ── Image ──────────────────────────────────────────────────────────────────
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      const b64       = buf.toString('base64');
      const mediaType = (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`) as 'image/jpeg' | 'image/png' | 'image/webp';

      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
            { type: 'text', text: SCHEMA_PROMPT },
          ],
        }],
      });

      const text = msg.content.find(b => b.type === 'text')?.text ?? '[]';
      units = parseUnits(text);
    }

    // ── PDF — use Claude's native document reading (handles both text & image PDFs) ──
    else if (ext === 'pdf') {
      const b64 = buf.toString('base64');

      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
            { type: 'text', text: SCHEMA_PROMPT },
          ] as any,
        }],
      });

      const text = msg.content.find(b => b.type === 'text')?.text ?? '[]';
      units = parseUnits(text);
    }

    // ── Excel / CSV ────────────────────────────────────────────────────────────
    else if (['xlsx', 'xls', 'csv'].includes(ext)) {
      const wb   = xlsx.read(buf, { type: 'buffer', cellDates: true });
      const rows: string[] = [];
      wb.SheetNames.forEach(name => {
        const ws   = wb.Sheets[name];
        const data = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
        rows.push(`=== Sheet: ${name} ===`);
        rows.push(data.map(r => (r as unknown[]).join('\t')).join('\n'));
      });

      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        messages: [{
          role: 'user',
          content: `${SCHEMA_PROMPT}\n\nFILE CONTENT:\n${rows.join('\n')}`,
        }],
      });

      const text = msg.content.find(b => b.type === 'text')?.text ?? '[]';
      units = parseUnits(text);
    }

    else {
      return NextResponse.json({ error: `Unsupported file type: .${ext}` }, { status: 400 });
    }

    return NextResponse.json({ units, fileName: file.name, count: units.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Extraction failed' }, { status: 500 });
  }
}
