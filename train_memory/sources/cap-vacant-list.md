# CAP Properties vacant list

**Handler:** `lib/parsers/cap.ts`. Trained on the 13-09-2026 template and confirmed on the 21-10-2026 file.
**Shape:** one sheet, 16 fixed columns, possibly a "BRAND NEW PROPERTIES" section first, with repeating mini-headers per property group.

- `Property` = `Flat # {unit_no} ({CAPxxx} {area code})`: unit number is everything before the bracket; the CAP code identifies the building.
- `Description` carries furnishing, bedrooms, bathrooms and parking: `(Fully Furnished) - 2 Bedroom - 2.5 Bathroom … One Dedicated Parking | Without Parking`.
- `Utilities`: Including Water & Electricity (also with gas / Marafeq chilled water) → Included + Kahramaa not applicable; Excluding … → Excluded + applicable.
- Trading name "CAP Properties" is registered as "Capital One Real Estate".

Full column mapping and edge cases: see the parser and its header comments.
