# AXIOM → REIMS pipeline design

## Flow
Upload → Match & Review → Validation → Stage → REIMS queue → Import.

- **Upload** (`/api/extract`): one entry for every file. A trained parser handles known layouts; anything else goes to the AI with the trained rule prompt. Every result then passes through the shared defaults and zone-name fill.
- **Match & Review**: realtor, entity, agent and one zone per property group are chosen. Master Codes are generated per zone.
- **Validation / Stage**: people complete blanks (for example rents) and review the REIMS impact.
- **REIMS queue → Import**: the REIMS apply route writes units, operational notes and agency commission.

## Codes
- **Master Code (16)** = category (1) + entity (3) + agent (2) + zone (2) + DDMM + HHMM. One per zone in a batch.
- **Smart Code (14)** = category + entity + agent + zone + type (2) + sequence (4), issued by `cr_assign_smart_code` (must stay `SECURITY DEFINER`).
- Displayed stacked: Master Code (blue, monospace) over Smart Code (green chip).

## Guards (all global)
| Guard | Where |
|---|---|
| Prefix and unit-level duplicate check per zone; Generate gated on it | Match & Review, `/api/master-code/check` |
| Override needs a reason of 10+ characters, logged per prefix | `cr_master_code_overrides` |
| Zone and realtor chosen on screen are written onto the records at Generate | `components/IngestPipeline.tsx` |
| Send to REIMS blocked without smart code, realtor, or zone matching the Master Code | `components/IngestPipeline.tsx` |
| Direct entry requires rent above 0 | `components/IngestPipeline.tsx` |

## Value conversions
- Free months: AXIOM months → REIMS days (×30) on import.
- Commission: one week = monthly rent ÷ 4 → `unit_commissions`, Paid By "Real Estate Company".
- Missing bathrooms / parking / kitchen → defaults with a cross-check remark (switch off with `AXIOM_MISSING_FIELD_DEFAULTS=off`).

## Not built (decided against or deferred)
Zone alias table (names like "alsadd" mapped to codes by a stored table) was proposed but not built; unresolved areas are chosen in Match & Review.
