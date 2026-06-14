import { NextRequest, NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

const OR_URL   = 'https://openrouter.ai/api/v1/chat/completions';
const OR_MODEL = 'anthropic/claude-sonnet-4-5';

const SCHEMA_PROMPT = `You are a real estate data extraction specialist for Qatar property market.
Extract ALL unit/property records from the provided file content.

Return ONLY a JSON array of objects. Each object must use these exact field names:
unit_code, property, unit_no, zone, zone_code, type, config, furnishing, kitchen,
status, rent, service_charges, deposit_amount, agency_fee, listing_type,
bedrooms, bathrooms, parking, floor, area_sqft, realtor_name, realtor_moci,
moci_contract_status, moci_contract_number, legal_duration,
contract_start_date, contract_end_date, location_map_url, notes

Normalisation rules:
- status: map to one of Available | Leased | Reserved | Under_Maintenance
- furnishing: Fully Furnished | Semi-Furnished | Unfurnished
- listing_type: Rent | Sale
- dates: YYYY-MM-DD format
- rent/charges: numbers only, no currency symbols
- If a field is not present, omit it (do not include null values)
- For side-by-side multi-unit layouts, extract each unit as a separate record
- Ignore headers, logos, footers, marketing text — only extract actual unit data

Return raw JSON array only. No markdown, no explanation.`;

async function callOpenRouter(messages: unknown[]): Promise<string> {
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ANTHROPIC_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://d-inges.vercel.app',
      'X-Title': 'REIMS Ingestion Service',
    },
    body: JSON.stringify({ model: OR_MODEL, messages, max_tokens: 8096 }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices?.[0]?.message?.content ?? '[]';
}

function parseUnits(text: string): Record<string, unknown>[] {
  return JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const ext  = file.name.split('.').pop()?.toLowerCase() ?? '';
  const bytes = await file.arrayBuffer();
  const buf   = Buffer.from(bytes);

  try {
    let units: Record<string, unknown>[] = [];

    // ── Image ─────────────────────────────────────────────────────────────────
    if (['jpg','jpeg','png','webp'].includes(ext)) {
      const b64  = buf.toString('base64');
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const text = await callOpenRouter([{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
          { type: 'text', text: SCHEMA_PROMPT },
        ],
      }]);
      units = parseUnits(text);
    }

    // ── PDF ───────────────────────────────────────────────────────────────────
    else if (ext === 'pdf') {
      const tmp = join(tmpdir(), `ingest-${Date.now()}.pdf`);
      writeFileSync(tmp, buf);
      const { stdout } = await execAsync(`pdftotext -layout "${tmp}" -`).catch(() => ({ stdout: '' }));
      unlinkSync(tmp);
      const text = await callOpenRouter([{
        role: 'user',
        content: `${SCHEMA_PROMPT}\n\nFILE CONTENT:\n${stdout}`,
      }]);
      units = parseUnits(text);
    }

    // ── Excel / CSV ───────────────────────────────────────────────────────────
    else if (['xlsx','xls','csv'].includes(ext)) {
      const wb   = xlsx.read(buf, { type: 'buffer', cellDates: true });
      const rows: string[] = [];
      wb.SheetNames.forEach(name => {
        const ws   = wb.Sheets[name];
        const data = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
        rows.push(`=== Sheet: ${name} ===`);
        rows.push(data.map(r => (r as unknown[]).join('\t')).join('\n'));
      });
      const text = await callOpenRouter([{
        role: 'user',
        content: `${SCHEMA_PROMPT}\n\nFILE CONTENT:\n${rows.join('\n')}`,
      }]);
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
