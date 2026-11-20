# Ramaco Trading and Contracting availability list

**Handler:** images use the AI prompt rules in `app/api/extract/route.ts`; the corrected Nov 2026 dataset was loaded as a sheet with AXIOM field names (`lib/parsers/canonical.ts`).
**Shape:** WhatsApp image, four tables (Flats, Villas, Restaurant, Others), a QTY column, no unit numbers.

## Confirmed rules (user answers, 2026-11-11 and 2026-11-20)
- Quantity rows expand to one unit each, numbered `TBC-01…` per property, the sequence continuing across rows and tables (G04). Remark: "Unit number not provided in source — placeholder assigned". This is the standard default for any quantity-only list, not an open item.
- Rent ranges: rent left blank, range in operator_remarks (G03).
- "2BR+1" / "4BR+1" → N BHK plus Maids Room. Restaurant table ignored.
- Commission: one week's rent, paid by the Real Estate Company, for the tables that state it (flats and "others"). The villa table states none, so it is left blank for the end user (G05).
- Y Village 01 flats and villas are separate units. Table 1 furnishing is not stated, so it is left blank (never inferred).
- NO INCLUSIONS → Excluded + Kahramaa applicable; "Electricity and Water Included" → Included + not applicable; "Free Shared Internet" → WiFi. Lease terms (villas, FJ9, Y Village 02) → legal_duration "2 years".
- Zones: Al Sadd 38, Umm Ghwailina 27, Lusail 69, Abou Sidra 55, Al Messila 36, Old Airport 45, Al Hilal 42, Bin Mahmoud 22. Entity code RAM.

## Result (Nov 2026)
47 units imported (35 apartments, 12 villas); 35 commissions set (amount = rent ÷ 4); free months stored as 30 / 45 days.
