# Retaj per-building block list

**Handler:** `lib/parsers/retajBlockList.ts` (hidden sheets skipped). First trained on the Alshaheen (Al Naser) list, Nov 2026.
**Shape:** title such as `ALSHAHEEN ( ALNASER )`; header BUILDING / UNIT NO. / PRICE / TYPE / BILLS / OFFER / AGENT / STATUS / LOCATION / BUILDING NO.; one merged block per building, one unit per row.

## Rules (confirmed 2026-11-21 on top of the Retaj vacant-list rules)
- A block is the group of rows sharing the merged building-level cells; a unit row with no building name of its own belongs to the block it is merged with.
- TYPE "2BHK - FF" → config 2 BHK + Fully Furnished. OFFER "1 MONTH FREE" → month free count 1 (REIMS stores 30 days). BILLS: global rule G02 (including "INCLUDING ( W & ELEC )"). Building number → maintenance_notes "Building No. N".
- "X" in the unit column → nothing imported. A row with a type but no unit number or price is skipped.
- BOOKED under AGENT or STATUS (the source headers are swapped) → status Reserved. Red font here marks shared labels (offer, type, building number), not unit numbers, so it is ignored.
- Area from the title in brackets: ALNASER → zone 39. Map link only where the location cell has one. Realtor chosen in Match & Review.
- A unit listed twice with identical details is imported once (global rule G15).

## Result of the first file
12 rows → 11 units (one exact duplicate of unit 103 removed), 2 Reserved, all zone 39, rents 6,000 / 5,750.
