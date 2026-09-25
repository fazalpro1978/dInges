import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'ingest' } },
);

// Public-schema client for reading/writing REIMS units and calling RPCs
const reims = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getNowSegments(): { ddmm: string; hhmm: string } {
  const now = new Date();
  const dd   = String(now.getDate()).padStart(2, '0');
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const hh   = String(now.getHours()).padStart(2, '0');
  const min  = String(now.getMinutes()).padStart(2, '0');
  return { ddmm: dd + mm, hhmm: hh + min };
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const { runId, orphanedUnitIds } = (await req.json()) as {
      runId: string;
      orphanedUnitIds?: string[];
    };

    if (!runId) {
      return NextResponse.json({ error: 'runId required' }, { status: 400 });
    }

    const { ddmm, hhmm } = getNowSegments();
    const now = new Date().toISOString();

    // Fetch all vetted records for this run
    const { data: vetted, error: vErr } = await admin
      .from('vetted_records')
      .select('id, payload, match_type, delta_status')
      .eq('run_id', runId)
      .is('acknowledged_at', null);

    if (vErr || !vetted) {
      return NextResponse.json({ error: vErr?.message ?? 'Failed to fetch vetted records' }, { status: 500 });
    }

    let applied = 0;
    let skipped = 0;
    let refreshed = 0;
    const errors: { id: string; error: string }[] = [];

    for (const record of vetted) {
      const deltaStatus = record.delta_status as string | null;
      const payload     = record.payload as Record<string, unknown>;

      // ── ST_UNCHANGED: no-op ──────────────────────────────────────────────
      if (deltaStatus === 'ST_UNCHANGED') {
        skipped++;
        await admin.from('vetted_records').update({ acknowledged_at: now }).eq('id', record.id);
        continue;
      }

      // ── ST_UPDATED: patch fields + refresh MC timestamp ──────────────────
      if (deltaStatus === 'ST_UPDATED') {
        const unitId = payload.unitId as string | null ?? payload.__unit_id as string | null;
        if (!unitId) {
          errors.push({ id: record.id, error: 'ST_UPDATED record missing unitId' });
          continue;
        }

        const updateFields: Record<string, unknown> = {};
        const patchable = ['status', 'rent', 'furnishing', 'service_charges', 'deposit_amount', 'agency_fee', 'listing_type', 'operator_remarks', 'month_free_applicable', 'month_free_days', 'kahramaa_applicable', 'kahramaa_amount', 'water_electricity', 'water_electricity_limit_applicable', 'water_electricity_limit_amount', 'focal_point_name', 'focal_point_phone', 'focal_point_email'];
        for (const f of patchable) {
          if (payload[f] != null && payload[f] !== '') updateFields[f] = payload[f];
        }
        // Split contact_details into focal_point columns for ST_UPDATED too
        const cdPatch = typeof payload['contact_details'] === 'string' ? (payload['contact_details'] as string).trim() : '';
        if (cdPatch) {
          const pm = cdPatch.match(/^(.*?)\s+(\+?[\d\s\-().]{6,})$/);
          if (pm) { updateFields.focal_point_name = pm[1].trim() || null; updateFields.focal_point_phone = pm[2].trim() || null; }
          else { updateFields.focal_point_name = cdPatch; }
        }

        const { error: uErr } = await reims.from('units').update(updateFields).eq('id', unitId);
        if (uErr) { errors.push({ id: record.id, error: uErr.message }); continue; }

        // Refresh MC DDMMTIME suffix — Smart Code stays unchanged
        await reims.rpc('cr_refresh_master_code_timestamp', {
          p_unit_id:   unitId,
          p_run_ddmm:  ddmm,
          p_run_hhmm:  hhmm,
        });

        await admin.from('vetted_records').update({ acknowledged_at: now }).eq('id', record.id);
        refreshed++;
        applied++;
        continue;
      }

      // ── ST_NEW (default): insert new unit + generate Smart Code + Master Code ─
      const typeCode = (payload.type_code as string | null) ?? 'XX';
      const { data: assignment } = await reims.rpc('cr_assign_smart_code', {
        p_category:  payload.category  ?? 'R',
        p_entity:    payload.entity_code ?? '',
        p_agent:     payload.agent_code  ?? '',
        p_zone_code: String(payload.zone_code ?? '00').padStart(2, '0'),
        p_type_code: typeCode,
        p_realtor:   String(payload.realtor_name ?? ''),
        p_property:  String(payload.property ?? ''),
        p_unit_no:   String(payload.unit_no ?? ''),
        p_zone_name: String(payload.zone ?? ''),
      });

      const smartCode = assignment?.smart_code ?? null;

      // Generate Master Code for new unit
      const { data: masterCode } = await reims.rpc('cr_generate_master_code', {
        p_category:    payload.category   ?? 'R',
        p_entity_code: payload.entity_code ?? '',
        p_agent_code:  payload.agent_code  ?? '',
        p_zone_code:   String(payload.zone_code ?? '00').padStart(2, '0'),
        p_run_ddmm:    ddmm,
        p_run_hhmm:    hhmm,
        p_property_ref: String(payload.property ?? ''),
      });

      // Remove pipeline metadata before inserting
      const { category: _c, entity_code: _e, agent_code: _a, type_code: _t, unitId: _u, __unit_id: _ui,
              contact_details: _cd, ...unitPayload } = payload as Record<string, unknown>;

      // Split contact_details ("Name Phone") → focal_point_name / focal_point_phone
      const contactRaw = typeof _cd === 'string' ? _cd.trim() : '';
      if (contactRaw) {
        const phoneMatch = contactRaw.match(/^(.*?)\s+(\+?[\d\s\-().]{6,})$/);
        if (phoneMatch) {
          unitPayload.focal_point_name  = phoneMatch[1].trim() || null;
          unitPayload.focal_point_phone = phoneMatch[2].trim() || null;
        } else {
          unitPayload.focal_point_name = contactRaw;
        }
      }

      const { error: iErr } = await reims.from('units').insert({
        ...unitPayload,
        smart_code:  smartCode,
        master_code: masterCode ?? null,
        source:      'axiom',
      });

      if (iErr) { errors.push({ id: record.id, error: iErr.message }); continue; }

      await admin.from('vetted_records').update({ acknowledged_at: now }).eq('id', record.id);
      applied++;
    }

    // ── Orphaned: auto-set status to 'Look UP' ───────────────────────────────
    let orphanedUpdated = 0;
    if (orphanedUnitIds && orphanedUnitIds.length > 0) {
      const { error: oErr } = await reims.from('units').update({ status: 'Look UP' }).in('id', orphanedUnitIds);
      if (!oErr) orphanedUpdated = orphanedUnitIds.length;
    }

    // Mark run as exported
    await admin.from('upload_runs').update({ status: 'exported', exported_count: applied }).eq('id', runId);

    return NextResponse.json({
      runId,
      applied,
      skipped,
      refreshed,
      orphanedUpdated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Delta apply failed' }, { status: 500 });
  }
}
