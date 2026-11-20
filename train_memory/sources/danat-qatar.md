# Danat Qatar

**Formats:** (A) XLSX import template, sheet "Units Import", handled by `lib/parsers/danatQatar.ts`; (B) PDF availability report, handled by the AI prompt.
- Template: property, unit number, area / location (zone code derived from it), type, config in BHK form, furnishing, rent, status. Bathrooms, kitchen and parking are blank in the template.
- Status: Available → Available, Upcoming → Under_Maintenance.
- Realtor: Danat Qatar.
- Dual pricing (semi-furnished and fully furnished) keeps the lower rent and records the higher one as rent_ff.
