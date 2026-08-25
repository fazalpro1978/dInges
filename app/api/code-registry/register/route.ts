import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/serverAuth';
import { registry } from '@/lib/registryClient';

// Phase 2 batch write — fires ONCE when the governance gate passes ("Review N Records →").
// Calls cr_generate_smart_code once per unlinked record.
// Linked records (resolution = 'link') only write a cr_registry_history note.

type RegisterRecord = {
  cardId: string;
  type_code: string;
  entity_code: string;
  agent_code: string;
  zone_code: number;
  building_name?: string | null;
  floor_ref?: string | null;
  unit_ref?: string | null;
  notes?: string | null;
};

type LinkRecord = {
  cardId: string;
  smart_code: string;  // existing code being linked
  registry_id: string;
  changed_by: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { records, links }: { records: RegisterRecord[]; links?: LinkRecord[] } = await req.json();

  const results: { cardId: string; smart_code: string; sequenceNumber?: number; error?: string }[] = [];

  // Generate new codes for unlinked records
  for (const rec of records ?? []) {
    const { data, error } = await registry.rpc('cr_generate_smart_code', {
      p_type_code:     rec.type_code,
      p_entity_code:   rec.entity_code,
      p_agent_code:    rec.agent_code,
      p_zone_code:     rec.zone_code,
      p_building_name: rec.building_name ?? null,
      p_floor_ref:     rec.floor_ref     ?? null,
      p_unit_ref:      rec.unit_ref      ?? null,
      p_notes:         rec.notes         ?? null,
    });

    if (error) {
      results.push({ cardId: rec.cardId, smart_code: '', error: error.message });
    } else {
      results.push({
        cardId:         rec.cardId,
        smart_code:     (data as { smart_code: string; sequence_number: number }).smart_code,
        sequenceNumber: (data as { smart_code: string; sequence_number: number }).sequence_number,
      });
    }
  }

  // Write history notes for linked records (no new code generated)
  for (const link of links ?? []) {
    await registry.from('cr_registry_history').insert({
      registry_id: link.registry_id,
      smart_code:  link.smart_code,
      from_status: 'active',
      to_status:   'active',
      changed_by:  auth.uid,
      notes:       `Linked from AXIOM batch import — no new code generated`,
    });
    results.push({ cardId: link.cardId, smart_code: link.smart_code });
  }

  const hasErrors = results.some(r => r.error);
  return NextResponse.json({ results }, { status: hasErrors ? 207 : 200 });
}
