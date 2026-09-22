import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/serverAuth';
import { registry } from '@/lib/registryClient';

// Derives a deterministic 3-char code from a company name (same logic as /api/realtors POST sync)
function deriveCode(name: string): string {
  const clean = name.toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(3, '0');
  return clean.slice(0, 3);
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  // Fetch both sources in parallel
  const [realtorsRes, entityRes] = await Promise.all([
    registry.from('realtors').select('name').order('name'),
    registry.from('cr_entity_codes').select('entity_code, company_name'),
  ]);

  if (realtorsRes.error) return NextResponse.json({ error: realtorsRes.error.message }, { status: 500 });

  // Build name → entity_code lookup from cr_entity_codes
  const codeMap = new Map<string, string>();
  for (const e of entityRes.data ?? []) {
    codeMap.set((e.company_name as string).toLowerCase(), e.entity_code as string);
  }

  // For each realtor, use the registered entity_code if available, else derive one
  const entityCodes = (realtorsRes.data ?? []).map(r => ({
    entity_code:  codeMap.get((r.name as string).toLowerCase()) ?? deriveCode(r.name as string),
    company_name: r.name as string,
  }));

  return NextResponse.json({ entityCodes });
}
