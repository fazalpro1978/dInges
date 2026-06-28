import { NextResponse } from 'next/server';
import { MASTER_FIELDS } from '@/lib/importSchema';

export async function GET() {
  const header = MASTER_FIELDS.map((f) => f.key).join(',');
  const csv = `${header}\n`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="units-import-template.csv"',
    },
  });
}
