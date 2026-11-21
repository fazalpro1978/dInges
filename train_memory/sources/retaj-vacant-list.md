# Retaj Properties vacant list

**Handler:** deterministic parser `lib/parsers/retajVacant.ts` (runs before the older Retaj-template parser; hidden sheets skipped).
**Shape:** block layout. Title "RETAJ PROPERTIES (VACANT LIST)"; header row has Building Name, Building Num, Unit Type, Units Available, price, Status, Bills, The Kind, Location, Area, Security Num, Photos. Building-level fields are on the first merged row of each block.

## Confirmed rules (user answers, 2026-11-10)
- Dash-joined unit numbers expand to one unit each. "X" (no unit number) imports nothing; "NEXT PAGE" rows skipped; SHOP rows dropped; hidden Inovia sheet ignored.
- Config: `3bhk`, `2 BR` → `N BHK`; STUDIO → Studio; DUBLEX → Duplex; "(small/big/medium)" ignored; `+MAID` → Maids Room, `+STORE` → Store Room, `+BALCONY` → Balcony.
- Furnishing: FF Fully Furnished, UF/uf Unfurnished, sf/SF Semi-Furnished.
- Bills: see global rule G02.
- Rent: single number is the rent; any range leaves rent blank with the range in operator_remarks (G03). `+nMF` sets month free (count n; REIMS converts to days).
- Red font on an individual unit number → status Reserved for that unit. Red "X" alone is ignored.
- "sttaf only" kind → import, operator_remarks STAFF ONLY. Building number → maintenance_notes "Building No. N". Security phone → contact_details (imported units only).
- Defaults when absent: global rule G01.
- Realtor is not in the file; chosen in Match & Review.
- Areas resolve to a zone code only when unambiguous: alsadd 38, alnaser 39, Umm Ghuwailina 27, Old Airport 45, Lusail 69, Al Ghrafa 51, Al Waab / Abu Hamour 55, Al Messila 36, Bin Omran 37, Fareej Kulaib 35, Old Salata 18. Corniche, Mushirab and buildings with no area are chosen by the user.

## Source-specific (do not generalise)
Unit-number splitting, X / NEXT PAGE skipping, red-font = Reserved, SHOP dropping. These depend on how Retaj writes its list.

## Result of the first run (Nov 2026)
81 units (8 Reserved); 6 rents entered by hand; imported to REIMS and verified.

When the same workbook also has detail sheets that the NEXT PAGE cells point to, the workbook reader (`retaj-workbook.md`) joins them; without those sheets the NEXT PAGE rows import nothing, as above.
