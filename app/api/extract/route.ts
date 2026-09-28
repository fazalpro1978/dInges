import { NextRequest, NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';

const execAsync = promisify(exec);

const MODEL = 'claude-sonnet-4-6';

const SCHEMA_PROMPT = `You are a real estate data extraction specialist for Qatar property market.
Extract ALL unit/property records from the provided file content.

Return ONLY a JSON array of objects. Each object must use these exact field names:
unit_code, property, unit_no, zone, zone_code, type, config, furnishing, kitchen,
status, rent, size_sqm, service_charges, deposit_amount, agency_fee, listing_type,
bedrooms, bathrooms, parking, floor, area_sqft, realtor_name, realtor_moci,
moci_contract_status, moci_contract_number, legal_duration,
contract_start_date, contract_end_date, location_map_url, media_url, notes,
month_free_applicable, month_free_days,
kahramaa_applicable, kahramaa_amount,
water_electricity, water_electricity_limit_applicable, water_electricity_limit_amount,
operator_remarks

REMARKS SPANNING MULTIPLE COLUMNS: When a spreadsheet spreads remarks/notes across
several adjacent columns (e.g. columns G, H, I all contain partial remarks for the
same unit), concatenate all non-empty values from those columns into a single string
before applying any extraction rules below.

PRICE vs SIZE (SQM) DISAMBIGUATION — critical rule:
- For RESIDENTIAL units (Flat, Studio, Apartment, Villa): the price/rent column
  contains the monthly QAR rent → populate "rent". Do NOT populate "size_sqm" from
  this column unless a separate SQM column exists.
- For COMMERCIAL units (Office, Shop, Showroom, Warehouse) or when the word "SQM"
  or "sqm" appears anywhere in the same row: the price column contains the unit area
  in square metres, NOT rent → populate "size_sqm" with that number. Leave "rent"
  null/omitted. Never treat an SQM area value as a rent amount.
- size_sqm: numeric square metre area of the unit. Populate only when the source
  value is confirmed as area (SQM), not rent. Maps to REIMS → Units Inventory →
  Property & Unit → Classification → Size (sqm).

FURNISHING rules — set "furnishing" ONLY when explicitly stated; never infer it:
- Source text "Furnished" or "Fully Furnished" or "FF" → furnishing: "Fully Furnished"
- Source text "Semi Furnished", "Semi-Furnished", "SF" → furnishing: "Semi-Furnished"
- Source text "Shell & Core": DO NOT set furnishing. Instead add to operator_remarks:
  "Shell & Core — structural state only; tenant responsible for all interior finishes
  and fittings." Set status: "Available".
- Source text "Ready for move in": this indicates status only → status: "Available".
  Do NOT set furnishing based on this phrase.
- No furnishing mention at all → omit furnishing entirely (do not default to Unfurnished).

SKIP ROWS: Ignore any row where the property/building name cell contains
"Total vacant units", "Total", "Sub-total", or similar summary text — these are
subtotal rows, not unit records.

- media_url: URL pointing to a photo folder, media storage, or document library for this unit (e.g. Google Drive, OneDrive, Dropbox link). Often found in a column labelled PHOTOS, Media, Images, or similar — the cell may display a label like "PHOTOS" with a hyperlink behind it; the hyperlink URL is provided in square brackets after the cell value, e.g. "PHOTOS [https://drive.google.com/…]". Extract the URL. null if absent.
- month_free_applicable: true if the rent cell OR the remarks/notes column contains any "month free" incentive — any phrasing like "1 Month Free", "2 Months free", "one month free", "+ 1 Free Month", "1ST MONTH FREE", "FIRST MONTH FREE", etc. false otherwise.
- month_free_days: integer number of free months (e.g. "7000 + 1 Month Free" → 1, "10,000 + 2 Months free" → 2, "one month free" → 1, "2 MONTHS FREE" → 2). Extract from rent cell first, then remarks as fallback. Omit if month_free_applicable is false.
- kahramaa_applicable: false when ANY column (remarks, utilities, terms, kahramaa column, or any dedicated column) contains "INCLUDING KAHRAMAA", "INCLUDING KAHRAMA", "Including Kahrama", "Including Kahramaa", "INCLUDING ALL BILLS", "ALL BILLS INCLUDED", or any phrasing that utilities are included in the rent (tenant does NOT pay a separate kahramaa deposit). true when "EXCLUDING KAHRAMAA" or "KAHRAMAA NOT INCLUDED" appears anywhere. Omit only if kahramaa is not mentioned in any column.
- kahramaa_amount: numeric deposit amount for kahramaa extracted from any column (e.g. "2000 FOR KAHRAMAA DEPOSIT" → 2000). Omit if not mentioned.
- water_electricity: check ALL columns (remarks, a dedicated Kahrama/utilities/terms column, or any other column). Set to "Included" when ANY column contains "INCLUDING KAHRAMAA", "INCLUDING KAHRAMA", "Including Kahrama", "Including Kahramaa", "INCLUDING ALL BILLS", "ALL BILLS INCLUDED", "Kahramaa Included", or any phrasing that water & electricity is covered in the rent. Set to "Excluded" when "EXCLUDING KAHRAMAA", "Excluding Kahrama", or utilities explicitly NOT included appears in any column. A standalone dedicated column value of "Including Kahrama" or "Including Kahramaa" is sufficient — it does not need to appear in the remarks column. Omit if not mentioned in any column.
- water_electricity_limit_applicable: true if remarks mention a usage limit or cap on water/electricity (e.g. "KAHRAMAA UP TO 500 QAR"). Omit if not mentioned.
- water_electricity_limit_amount: numeric QAR cap for water/electricity (e.g. "KAHRAMAA UP TO 500 QAR" → 500). Omit if not mentioned.
- deposit_amount: if remarks specify the security deposit as a multiple of rent (e.g. "SECURITY DEPOSIT 1 MONTH RENTAL AMOUNT", "SECURITY DEPOSIT 2 MONTHS RENT"), set deposit_amount = N × rent (where N is the number of months stated and rent is the extracted rent value for this unit). If remarks give a fixed QAR deposit amount (e.g. "SECURITY DEPOSIT 5000 QAR"), use that number directly. If the column already has an explicit deposit value, keep it — only derive from remarks when the column is blank or absent.
- operator_remarks: auto-extract payment conditions, document requirements, and operational notes from the remarks/notes column. Examples: "PDC FOR RENT PAYMENT", "CR, EST CARD, QID REQUIRED", "SECURITY DEPOSIT 1 MONTH RENTAL AMOUNT", "LABOUR CAMP ACCOMMODATION NEAR UMM-SALAL". Also include "Shell & Core" condition notes here when applicable (see FURNISHING rules above). Do NOT include furnishing or amenity information here (those go in their own fields). Concatenate multiple conditions with " · ". Omit if remarks contain no operational notes.

Normalisation rules:
- status: map to one of Available | Leased | Reserved | Under_Maintenance
- furnishing: Fully Furnished | Semi-Furnished | Unfurnished — only set when explicitly stated (see FURNISHING rules above)
- listing_type: Rent | Sale
- type: map "Flat" or "flat" → "Apartment"; "studio" or "Studio" → "Studio"; "Office" or "Offices" → "Office"; "Shop" → "Shop". CRITICAL: "Residential", "Residiential", "Commercial", "Industrial" are BUILDING CATEGORY labels (property-level), NOT unit types — NEVER output these as the type field. Unit type must come from the unit-type column (Flat/Studio/Office/Shop etc.), never from the building-category column.
- kitchen: normalise "CLOSE" or "Close" → "Closed"; "OPEN" → "Open"
- config: parse BHK pattern from remarks e.g. "2BHK + 2 BATHROOM" → config: "2 BHK"; "3 BHK + 2 BATHROOM" → config: "3 BHK"
- bathrooms: parse from remarks e.g. "2BHK + 2 BATHROOM" → bathrooms: 2; "2BHK + 1 BATHROOM" → bathrooms: 1
- dates: YYYY-MM-DD format
- rent/charges: numbers only, no currency symbols — strip any "+ N Month(s) Free" suffix before extracting the rent number
- If a field is not present, omit it (do not include null values)
- For side-by-side multi-unit layouts, extract each unit as a separate record
- Ignore headers, logos, footers, marketing text, and subtotal rows — only extract actual unit data

Return raw JSON array only. No markdown, no explanation.`;

function getClient() {
  const opts: ConstructorParameters<typeof Anthropic>[0] = { apiKey: process.env.ANTHROPIC_API_KEY };
  if (process.env.ANTHROPIC_WORKSPACE_ID) {
    opts.defaultHeaders = { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID };
  }
  return new Anthropic(opts);
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
      const b64      = buf.toString('base64');
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

    // ── PDF ────────────────────────────────────────────────────────────────────
    else if (ext === 'pdf') {
      const tmp = join(tmpdir(), `ingest-${Date.now()}.pdf`);
      writeFileSync(tmp, buf);
      const { stdout } = await execAsync(`pdftotext -layout "${tmp}" -`).catch(() => ({ stdout: '' }));
      unlinkSync(tmp);

      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 8096,
        messages: [{
          role: 'user',
          content: `${SCHEMA_PROMPT}\n\nFILE CONTENT:\n${stdout}`,
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
        const ws    = wb.Sheets[name];
        const ref   = ws['!ref'];
        let data: unknown[][];
        if (ref) {
          // Propagate merged cell values to every cell in the merge range so
          // multi-row remarks/groups aren't silently empty for rows 2+.
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

          // Custom extraction: append hyperlink URL in brackets so Claude sees it
          const range = xlsx.utils.decode_range(ref);
          data = [];
          for (let r = range.s.r; r <= range.e.r; r++) {
            const row: unknown[] = [];
            for (let c = range.s.c; c <= range.e.c; c++) {
              const addr = xlsx.utils.encode_cell({ r, c });
              const cell = ws[addr] as (xlsx.CellObject & { l?: { Target?: string } }) | undefined;
              if (!cell) { row.push(''); continue; }
              const val = cell.v ?? '';
              const link = cell.l?.Target;
              row.push(link ? `${val} [${link}]` : val);
            }
            data.push(row);
          }
        } else {
          data = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
        }
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
