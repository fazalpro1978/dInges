# AXIOM train memory

The data-ingestion rules the business has confirmed, kept next to the code that enforces them.

| Where | What |
|---|---|
| `lib/trainMemory.ts` | Machine-readable registry: every rule, the date it was confirmed, and the files that enforce it |
| `train_memory/pipeline-design.md` | How a file travels from upload to REIMS and the guards on the way |
| `train_memory/sources/*.md` | Per-source training (Retaj, Ramaco, CAP, Danat Qatar) |
| `/api/extract` response `source` | Which trained profile handled a given file |

## Rules of the house
1. **A rule is only real if code enforces it.** Each rule in `lib/trainMemory.ts` lists its `enforcedBy` files.
2. **Run `npm run check:train-memory`** after changing a parser, the extraction prompt, or moving files. It fails if a rule points at a file that no longer exists or a profile has no document.
3. **Fixes found on one source are made global** unless they depend on that source's layout (see "Source-specific" in each source file).
4. **Never guess.** Ranges, furnishing, commission and unit numbers are left blank or placeholder-flagged rather than invented, and every default carries a "Please Cross Check" remark.
5. **Database changes are pasted by a person** into the Supabase SQL Editor; migration files in `supabase/migrations/` are the record.

## Adding a new source
1. Prefer a deterministic parser in `lib/parsers/` (see `retajVacant.ts`); route its output through `normalisers.ts`.
2. Register it in `app/api/extract/route.ts` and add a `SOURCE_PROFILES` entry plus a `HANDLER_PROFILE` key.
3. Write `train_memory/sources/<id>.md` and run `npm run check:train-memory`.

## Restore points (git tags)
`restore/pre-multizone-prefix`, `restore/pre-zone-writeback`, `restore/pre-realtor-writeback`, `restore/pre-global-rules`, `restore/pre-ramaco-canonical`, `restore/pre-train-memory`.
