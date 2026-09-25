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
status, rent, service_charges, deposit_amount, agency_fee, listing_type,
bedrooms, bathrooms, parking, floor, area_sqft, realtor_name, realtor_moci,
moci_contract_status, moci_contract_number, legal_duration,
contract_start_date, contract_end_date, location_map_url, media_url, notes,
month_free_applicable, month_free_days,
kahramaa_applicable, kahramaa_amount,
operator_remarks

- media_url: URL pointing to a photo folder, media storage, or document library for this unit (e.g. Google Drive, OneDrive, Dropbox link). Often found in a column labelled PHOTOS, Media, Images, or similar — the cell may display a label like "PHOTOS" with a hyperlink behind it; the hyperlink URL is provided in square brackets after the cell value, e.g. "PHOTOS [https://drive.google.com/…]". Extract the URL. null if absent.
- month_free_applicable: true if the rent cell OR the remarks/notes column contains any "month free" incentive — any phrasing like "1 Month Free", "2 Months free", "one month free", "+ 1 Free Month", etc. false otherwise.
- month_free_days: integer number of free months (e.g. "7000 + 1 Month Free" → 1, "10,000 + 2 Months free" → 2, "one month free" → 1). Extract from rent cell first, then remarks as fallback. Omit if month_free_applicable is false.
- kahramaa_applicable: true when rent or remarks say "INCLUDING KAHRAMAA", "INCLUDING ALL BILLS", "ALL BILLS INCLUDED", or any phrasing that implies utilities are included; false when they say "EXCLUDING KAHRAMAA" or "KAHRAMAA NOT INCLUDED". "INCLUDING ALL BILLS" unambiguously means kahramaa is included → true. Omit only if kahramaa is not mentioned anywhere for this unit.
- kahramaa_amount: numeric deposit amount for kahramaa extracted from remarks (e.g. "2000 FOR KAHRAMAA DEPOSIT" → 2000). Omit if not mentioned.
- deposit_amount: if remarks specify the security deposit as a multiple of rent (e.g. "SECURITY DEPOSIT 1 MONTH RENTAL AMOUNT", "SECURITY DEPOSIT 2 MONTHS RENT"), set deposit_amount = N × rent (where N is the number of months stated and rent is the extracted rent value for this unit). If remarks give a fixed QAR deposit amount (e.g. "SECURITY DEPOSIT 5000 QAR"), use that number directly. If the column already has an explicit deposit value, keep it — only derive from remarks when the column is blank or absent.
- operator_remarks: auto-extract payment conditions, document requirements, and operational notes from the remarks/notes column. Examples: "PDC FOR RENT PAYMENT", "CR, EST CARD, QID REQUIRED", "SECURITY DEPOSIT 1 MONTH RENTAL AMOUNT", "LABOUR CAMP ACCOMMODATION NEAR UMM-SALAL". Do NOT include furnishing or amenity information here (those go in their own fields). Concatenate multiple conditions with " · ". Omit if remarks contain no operational notes.

Normalisation rules:
- status: map to one of Available | Leased | Reserved | Under_Maintenance
- furnishing: Furnished | Semi-Furnished | Unfurnished
- listing_type: Rent | Sale
- dates: YYYY-MM-DD format
- rent/charges: numbers only, no currency symbols — strip any "+ N Month(s) Free" suffix before extracting the rent number
- If a field is not present, omit it (do not include null values)
- For side-by-side multi-unit layouts, extract each unit as a separate record
- Ignore headers, logos, footers, marketing text — only extract actual unit data

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
