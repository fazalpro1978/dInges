import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { MASTER_FIELDS, BATCH_FIELDS } from '@/lib/importSchema';

export const dynamic = 'force-dynamic';

const SAMPLE_ROW: Record<string, string> = {
  property:         'Viva Bahriya Tower 1',
  unit_no:          'A-101',
  zone_code:        '66',
  type:             'Apartment',
  config:           '2 BHK',
  furnishing:       'Furnished',
  bathrooms:        '2',
  kitchen:          'Open',
  parking:          '1',
  rent:             '8500',
  status:           'Available',
  location_map_url: 'https://maps.google.com/?q=...',
  media_url:        'https://drive.google.com/...',
  realtor_name:     'Privé Real Estate',
};

const HINTS_ROW: Record<string, string> = {};
for (const f of [...MASTER_FIELDS, ...BATCH_FIELDS]) {
  if (f.enumValues) {
    HINTS_ROW[f.key] = `Allowed: ${f.enumValues.join(' | ')}`;
  } else if (f.kind === 'integer' || f.kind === 'numeric') {
    HINTS_ROW[f.key] = 'Number';
  } else if (f.kind === 'url') {
    HINTS_ROW[f.key] = 'https://...';
  } else {
    HINTS_ROW[f.key] = 'Text';
  }
}

export async function GET() {
  const allFields = [...MASTER_FIELDS, ...BATCH_FIELDS];

  // Header row — human-readable labels with required marker
  const headers = allFields.map(f => `${f.label}${f.required ? ' *' : ''}`);

  // Sample row
  const sample = allFields.map(f => SAMPLE_ROW[f.key] ?? '');

  // Hints row
  const hints = allFields.map(f => HINTS_ROW[f.key] ?? '');

  const ws = XLSX.utils.aoa_to_sheet([headers, sample, hints]);

  // Column widths
  ws['!cols'] = allFields.map(f => ({ wch: Math.max(f.label.length + 4, 18) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Units Import');

  // Instructions sheet
  const instrRows = [
    ['Axiom — Property Data Import Template'],
    [''],
    ['Instructions:'],
    ['1. Fill data starting from Row 2 (the sample row). Delete Row 2 before uploading if you wish.'],
    ['2. Row 3 (hints) shows allowed values for each column — delete it before uploading.'],
    ['3. Columns marked with * are REQUIRED. Leave optional columns blank if unknown.'],
    ['4. Enum columns must use the exact values listed in Row 3 (case-insensitive).'],
    ['5. Save as .xlsx or .csv before uploading to Axiom.'],
    [''],
    ['Required columns (*):', allFields.filter(f => f.required).map(f => f.label).join(', ')],
    ['Optional columns:',    allFields.filter(f => !f.required).map(f => f.label).join(', ')],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
  wsInstr['!cols'] = [{ wch: 28 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="axiom-units-import-template.xlsx"',
    },
  });
}
