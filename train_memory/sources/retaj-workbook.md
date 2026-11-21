# Retaj master workbook with detail sheets

**Handler:** `lib/parsers/retajWorkbook.ts`, used by `/api/extract` before any single-sheet parser. First trained on `RETAJ AVILABILITY6.xlsx` (Nov 2026).
**Realtor / entity:** "Retaj Real Estate", entity code RET (decided 2026-11-21). The earlier 148-unit import (12 Nov) used "Retaj" and the RNL prefix.

## How the sheets relate
- **Master `RETAJ LIST`** holds building-level facts (area, building number, security phone, photos, map link, bills, furnishing) and price bands. A cell reading `NEXT PAGE (SHEET)` (or a bare `NEXT PAGE`) means the units and exact prices are on another sheet.
- **Pointer resolution:** the name in brackets is matched to a visible sheet by name tokens; a bare pointer uses the building name on its row (`alshaheen 1` -> `ALSHAHEEN LIST`). Only referenced sheets are read.
- **Detail sheets** hold unit numbers, exact price, offer, status (BOOKED -> Reserved).

| Master block | Detail sheet | Joined by |
|---|---|---|
| alshaheen 1-7 | ALSHAHEEN LIST | building number (28, 41, 36, 38, 40, 43, 27) |
| W1-W5 | ALWAAB LIST | building number (44, 29, 23, 3; W5 has no detail rows) |
| RETAJ LACRYSTAL | LA-CRYSTAL LIST | building name |
| BLOCK 1-10 / BLOCK 30-40 | JERRA (TCA) | unit prefix J1-J10 / J30-J40 (`J2-108` = building J2, flat 108) |

## Rules
- Master supplies: area -> zone (alsadd 38, alnaser 39, alwaab 55), but **the zone REIMS already holds for a building wins** over the area guess: Jeera/TCA is zone **56** in Retaj's own data and in REIMS ("Abo Hamour" is ambiguous), so its 19 units are zone 56, security phone -> contact_details, photos -> media_url, map link, furnishing, bills (global rule G02), building number -> maintenance_notes. Detail overrides: price, offer (month free count), status, per-unit furnishing (Jeera FF/UF/SF, UN = Unfurnished).
- Alwaab "WITH BILLS" price is noted in remarks; rent is the price excluding bills.
- Units already in REIMS under Retaj's own Unit_ID naming (for example QS016_A105, QC007_A306, QJR05_A104, QW013_A108) are matched by building plus the last digits of the unit number and handed over under their existing names, so the unchanged matching engine classifies them as updates (rent, status, furnishing). Ambiguous matches are flagged; identical existing copies are reported (REIMS already holds `RETAJ WEST ALWAAB W-4 / QW013_A506` twice).
- New units in a building with existing units adopt its label pattern (AL SHAHEEN-n, RETAJ WEST ALWAAB W-n).
- Master units already current in REIMS are not offered again (the master sheet was identical to the 11 Nov upload).
- Not read unless asked: LAROSE LIST, COMMIRCAIL LIST (not referenced by the master); hidden INOVIA sheet is always ignored.

## Result on the first workbook
48 detail units: 26 new, 22 handed over as updates (15 with a changed rent, status or furnishing); 81 master units already current. Shown on Match & Review as a cross-reference report.
