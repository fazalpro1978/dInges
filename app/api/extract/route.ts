import { NextRequest, NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

const SCHEMA_PROMPT = `You are a real estate data extraction specialist for Qatar property market.
Extract ALL unit/property records from the provided document.

Return ONLY a JSON array of objects. Each object must use these exact field names:
unit_code, property, unit_no, zone, zone_code, type, config, furnishing, kitchen,
status, rent, service_charges, deposit_amount, agency_fee, listing_type,
bedrooms, bathrooms, parking, floor, area_sqft, realtor_name, realtor_moci,
moci_contract_status, moci_contract_number, legal_duration,
contract_start_date, contract_end_date, location_map_url, notes

Normalisation rules:
- property (MANDATORY — every record must have this):
  * Look in: a dedicated "Property", "Building", "Project", "Tower" column; OR a merged cell / heading above the data table; OR the document title; OR a label like "Property:", "Building:", "Project:" anywhere in the document.
  * Copy the same property name to every unit record that belongs to it.
  * If the document covers multiple properties, assign each unit to the correct one.
  * If you cannot find any property name, use the file's title or heading text as the value — never leave it blank.
- unit_no (MANDATORY — every record must have this):
  * Look for any column that uniquely identifies a unit: "Unit No.", "Apt No.", "Flat No.", "Room", "Room No.", "Suite", "Villa No.", "Office No.", "No.", "Ref.", "#", "SN", "S.N.", "Sl. No.", "Unit ID", "Unit", "APT", or any sequential identifier column.
  * Strip area/size notation only: "5- (362 sqm)" → "5", keep alphanumeric IDs as-is (e.g. "A-101" stays "A-101").
  * If the only identifier is a serial/row number (1, 2, 3...), use that number as unit_no.
  * Never omit this field — if uncertain, use the row's position number.
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
- rent: numbers only, no currency — strip "QAR", commas, ".00" (e.g. "QAR 6,500.00" → 6500)
- dates: YYYY-MM-DD format (for contract dates etc.; status dates use dd/mm/yy as above)
- Ignore: SN/serial numbers, section sub-headers (e.g. "UPCOMING VACANT APARTMENTS"), row colour banding, logos, footers, marketing text, offer details, booking agent names, BALCONY, VIEW columns
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
        max_tokens: 8096,
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
        max_tokens: 8096,
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
        max_tokens: 8096,
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
