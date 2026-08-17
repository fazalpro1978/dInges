import { NextRequest, NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

const SCHEMA_PROMPT = `You are a real estate data extraction specialist for Qatar property market.
Extract ALL unit/property records from the provided document.

Return ONLY a JSON array of objects. Each object must use these exact field names:
unit_code, property, unit_no, zone, zone_code, type, config, furnishing, kitchen,
status, rent, service_charges, deposit_amount, agency_fee, listing_type,
bedrooms, bathrooms, parking, floor, area_sqft, amenities, design_type,
realtor_name, realtor_moci, moci_contract_status, moci_contract_number, legal_duration,
contract_start_date, contract_end_date, location_map_url, notes,
contact_details, view

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
  * BALCONY SUFFIX (CRITICAL): Many sheets encode balcony presence in the unit_no cell. ALWAYS strip this suffix before assigning unit_no:
    - "102 / Balcony" → unit_no = "102"; add "Balcony" to amenities[]
    - "1214 / No Balcony" → unit_no = "1214"; do NOT add Balcony amenity
    - "1707 No Balcony" → unit_no = "1707"; do NOT add Balcony amenity (no slash variant)
    The slash and balcony token are NEVER part of the unit number.
  * COMMA/AMPERSAND MULTI-UNIT EXPANSION (CRITICAL): If a unit_no cell contains multiple flat/unit numbers separated by commas, ampersands (&), or both (e.g. "Flat No. 103,105,106,203,205,303,403,404,405,503,505" or "Flat 7, 15 & 20" or "Flat 12 & 37"), you MUST expand this into SEPARATE individual records — one record per flat/unit number. Every expanded record inherits ALL shared attributes from that row (property, zone, zone_code, type, config, furnishing, rent, status, realtor_name, etc.). For example: "Flat 7, 15 & 20" with rent 5500 → three records: unit_no "Flat 7", unit_no "Flat 15", unit_no "Flat 20", each with rent 5500 and all other fields identical. This is the most important extraction rule — failure to expand means missing records.
- type: Apartment | Villa | Office | Studio
  * Infer from unit_no: "APT." prefix → Apartment; "V"/"VIL" prefix → Villa
  * OFFICE / AL KHOR OFFICE → Office; STUDIO → Studio; bare number → Apartment default
- config: use format "N BHK" (e.g. "2 BHK", "3 BHK"); Studio → "Studio"; Office → "Office"
  * Strip spacing: "2BHK" → "2 BHK"; "1BHK" → "1 BHK"
  * "BR" is equivalent to "BHK" — "1br", "1BR", "1 BR" all normalise to "1 BHK"
  * COMBINED ENTRY SPLITTING: If one cell contains TWO distinct configurations joined by " / " where BOTH sides contain a bedroom count (e.g. "3 BR Villa / 4 BR villa"), this is TWO separate units — emit SEPARATE records, one per configuration. Each record inherits all other row fields (property, unit_no, zone, rent, status, realtor_name, etc.). Do NOT confuse this with the unit_no balcony suffix pattern ("102 / Balcony") — that is a single unit.
  * SUFFIX EXTRACTION (strip ALL of the following from config after extracting; config must contain ONLY "N BHK", "Studio", or "Office"):
    (A) "+Maid" / "+ Maid" / "+Maid Room" / "with Maid" / "3 BR + Maid" → add "Maids Room" to amenities; config = bedroom count only
    (B) "+Off" / "+off" / "+Office" / "1br+Off" → add "Office" to amenities; config = bedroom count only
    (C) "- Large BY" / "Large BY" / "- Large Backyard" / "(Large BY)" → add "Large Backyard" to amenities; set design_type = "Large" if no other design code found; config = bedroom count only
    (D) "with small backyard" / "small backyard" / "- Small BY" / "with Small Backyard" → add "Small Backyard" to amenities; config = bedroom count only
    (E) "w/ pool" / "with pool" → add "Private Pool" to amenities (individual villa has its own pool); config = bedroom count only
    (F) "- Large SP" where SP = Shared Pool → add "Shared Pool" to amenities; config = bedroom count only
    (G) "Rowhouse" → set type = "Villa"; add "Rowhouse" to amenities; config = bedroom count only (e.g. "5 BR Rowhouse" → config "5 BHK", type "Villa")
    (H) "(no backyard)" → strip; no amenity added; config = bedroom count only
    (I) "Villa" or "villa" suffix → set type = "Villa"; strip from config (e.g. "3 BR Villa" → config "3 BHK", type "Villa")
    (J) "Apartment" suffix → set type = "Apartment"; strip from config
  * DESIGN TYPE CODES (extract into design_type field — NEVER include in config):
    - "Type A" / "Type B" / "Type C" / "Type D" / "Type E" (e.g. "3 BR Type B") → design_type = "Type B"
    - Single letter in quotes: "'A'", "'B'", "'C'", "'D'", "'E'" (e.g. "2 BR 'C'") → design_type = "C"
    - "(Standard)" / "Standard" qualifier (e.g. "4 BR (Standard)", "4 BR -Standard BY") → design_type = "Standard"
    - "(Medium)" (e.g. "4 BR (Medium)") → design_type = "Medium"
    - "(Large BY)" already handled by suffix rule (C) above; set design_type = "Large"
    - After all suffix and design type codes are stripped, config = "N BHK" only
- furnishing: Furnished | Semi-Furnished | Unfurnished
  * FF / FULLY FURNISHED / LUXURY FULLY FURNISHED / FULLY-FURNISHED → Furnished
  * SF / SEMI-FURNISHED / SEMI FURNISHED → Semi-Furnished
  * UF / UNFURNISHED / UN-FURNISHED → Unfurnished
- status: normalise to one of these exact values:
  * "Available" — READY FOR VIEWING, Vacant, vacant, AVAILABLE
  * "Not Available" — CONTRACT, LEASED, Leased, CONTRACTED
  * "Reserved" — BOOKED, RESERVED
  * "Under Preparation" — UNDER MAINTENANCE, UNDER PREPARATION, UNDER RENOVATION, Upcoming, UPCOMING
  * "Awaiting Activation on {dd/mm/yy}" — when a date is present in the status cell; format date as dd/mm/yy (e.g. "Awaiting Activation on 03/07/26")
  * Skip the entire row if a property-level status is "FULL" with no unit data
  * COMBINED STATUS+FURNISHING TOKENS: When a status cell contains multiple tokens (e.g. "Vacant - Fully furnished", "Upcoming - Semi furnished"):
    - Extract the status part (before the dash/comma) and normalise it
    - Extract the furnishing part and write it to the furnishing field
    - "Mock up unit - FF" → status = "Available"; furnishing = "Furnished"; design_type = "Mock up unit"
    - "Mock up unit - SF" → status = "Available"; furnishing = "Semi-Furnished"; design_type = "Mock up unit"
    - "Vacant - Fully furnished" → status = "Available"; furnishing = "Furnished"
    - "Upcoming - Semi furnished" → status = "Under Preparation"; furnishing = "Semi-Furnished"
- listing_type: Rent | Sale
- rent: numbers only, no currency — strip "QAR", "QR", commas, ".00", "/ month", contract term text in parentheses (e.g. "QR 6,000 / month (1 year contract)" → 6000; "QAR 6,500.00" → 6500)
- dates: YYYY-MM-DD format (for contract dates etc.; status dates use dd/mm/yy as above)
- realtor_name: The COMPANY or BROKERAGE name that owns/manages the listing. Look for a dedicated "Company", "Agent", "Broker", "Real Estate" column or the document issuer name (e.g. "Al Emadi Enterprises" from the document header/logo/title). NEVER put a person's first name or watchman/caretaker name here (e.g. "Hussein", "Mohamed", "Azeez" are watchman names — not realtors). If no company name is identifiable, omit realtor_name entirely.
- amenities: string[] — an array of amenity tags present for the unit. Allowed values (use these exact strings only, omit any not applicable):
  "Balcony", "Barbecue Area", "Built-in Wardrobes", "Central A/C", "Covered Parking",
  "Private Gym", "Private Jacuzzi", "Kitchen Appliances", "Maids Room", "Pets Allowed",
  "Private Garden", "Private Pool", "Shared Pool", "Study", "View of Water",
  "Security", "Concierge", "Shared Spa", "Shared Gym", "Maid Service",
  "Walk-in Closet", "View of Landmark", "Children's Play Area", "Lobby in Building",
  "Children's Pool", "WiFi", "Office", "Large Backyard", "Small Backyard", "Rowhouse"
  Rules:
  (1) config "+Maid" suffix → "Maids Room"; strip from config
  (2) config "+Off"/"+off" suffix → "Office"; strip from config
  (3) WIFI/WiFi/Wi-Fi column "Yes" or "YES" → "WiFi"
  (4) Balcony column "Yes" → "Balcony"
  (5) unit_no "/ Balcony" suffix → "Balcony"; strip suffix from unit_no
  (6) unit_no "/ No Balcony" or "No Balcony" suffix → NO amenity; strip suffix from unit_no
  (7) config "- Large BY" / "Large BY" / "(Large BY)" → "Large Backyard"; strip from config
  (8) config "with small backyard" / "small backyard" / "- Small BY" → "Small Backyard"; strip from config
  (9) config "Rowhouse" → "Rowhouse" AND set type = "Villa"; strip from config
  (10) config "w/ pool" / "with pool" (villa context, individual unit) → "Private Pool"; strip from config
  (11) config "- Large SP" / "SP" suffix where SP = Shared Pool → "Shared Pool"; strip from config
  (12) VIEW column value is "Swimming Pool" → add "Shared Pool" to amenities (shared pool serves the whole property)
  (13) Omit the field entirely if no amenities are identified — do not include an empty array
- area_sqft: numeric size from "Size Sq.", "Size (sqm)", "Area", "Sq.m" column — store the number as-is (label says sqft but we treat it as sqm for Qatar properties).
- floor: numeric floor number from "Floor", "Fl." column — integer only.
- contact_details: Extract from any Watchman, Caretaker, Contact, Supervisor, or "Watchman Number" / "Watchman No." column. Format as "{Name} {Phone}" (e.g. "Hussein 51838959"). This is NOT the realtor — do not put it in realtor_name. Do not include the label "Contact:" in the value. If both a name and phone are present store them together; if only a phone number is present store it alone.
- view: Extract from any "VIEW", "View", "Orientation", "Facing", "Outlook" column. Normalise to the closest value from this list: Back View | Beach View | Canal View | City View | Clubhouse View | Community View | Corner View | Countryside View | Courtyard View | Desert View | Downtown View | Front View | Full View | Garden View | Golf Course View | Greenery View | Internal View | Lake View | Lagoon View | Landmark View | Main Road View | Marina View | Mountain View | Nature View | Neighbourhood View | Ocean View | Open View | Panoramic View | Park View | Partial View | Playground View | Pool View | Porto Arabia View | River View | Sea View | Side View | Skyline View | Sports View | Street View | Sunrise View | Sunset View | Swimming Pool View | Unobstructed View | Waterfront View. If the source value doesn't match any of these options closely, omit the field. Do not invent values outside this list.
- property: The BUILDING or PROPERTY name — e.g. "C25 Al Waab", "E-A3 Airport", "V35 Meisameer". The "Bldg. Code / Area" or "Building Code" column is the property field. The document issuer name (e.g. "Al Emadi Enterprises") is the REALTOR, not the property. Do not confuse the two.
- design_type: string — layout variant code or special unit designation, extracted from the config/bedroom column or status field. Omit entirely if not identifiable.
  * Config suffix codes: "Type A/B/C/D/E" → "Type A" / "Type B" etc.; single quoted letter "'C'" → "C"; "(Standard)" or "-Standard" → "Standard"; "(Medium)" → "Medium"; "Large" qualifier from "(Large BY)" → "Large"
  * Status field: "Mock up unit - FF" or "Mock up unit - SF" → "Mock up unit" (also parse furnishing from the token)
  * Rowhouse in config → also set design_type = "Rowhouse" in addition to the amenity
  * Do NOT put view codes (e.g. "SV/F", "Sea View / F") into design_type — those belong in the view field
- Ignore: SN/serial numbers, section sub-headers (e.g. "UPCOMING VACANT APARTMENTS"), row colour banding, logos, footers, marketing text, offer details, Viewing Time column. Do NOT output standalone boolean maid_room or wifi fields — absorb them into amenities[] instead.
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
