export type FieldKind = 'string' | 'integer' | 'numeric' | 'enum' | 'url';

export type MasterFieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  enumValues?: readonly string[];
  aliases: string[];
};

export const ENUM_PROPERTY_TYPE = ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio', 'Duplex', 'Office'] as const;
export const ENUM_FURNISHING    = ['Fully Furnished', 'Semi-Furnished', 'Unfurnished'] as const;
export const ENUM_STATUS        = ['Available', 'Leased', 'Reserved', 'Under_Maintenance'] as const;
export const ENUM_KITCHEN       = ['Open', 'Closed', 'Yes', 'Pantry'] as const;

// Duplicated from REIMS' lib/propertySchema.ts (UNIT_CONFIGS_FULL) — dInges is a
// separate deployable app with no access to REIMS' source tree, so this list must
// be kept in sync manually if REIMS ever adds/removes a configuration.
export const UNIT_CONFIGS_FULL: string[] = [
  'Studio', '1 BHK', '2 BHK', '3 BHK', '4+ BHK',
  '5+ BHK',
  '4 BHK', '5 BHK', '6+ BHK',
  "+ Maid's Room", "+ Driver's Room", '+ Study / Office',
  '4 BHK + Maid', '4 BHK + Maid (Private)', '5 BHK + Maid (Private)', 'Penthouse',
];

// ─── Master schema — fixed order, exactly as specified (keys = dInges' native field names) ──

export const MASTER_FIELDS: MasterFieldDef[] = [
  {
    key: 'realtor_moci', label: 'Realtor MOCI ID',
    kind: 'string', required: true,
    aliases: ['realtor moci id', 'realtor moci', 'moci', 'moci number', 'license number', 'realtor license'],
  },
  {
    key: 'unit_no', label: 'Property Unit No',
    kind: 'string', required: true,
    aliases: ['property unit no', 'unit no', 'unit number', 'room', 'room no', 'room number', 'unit'],
  },
  {
    key: 'zone_code', label: 'Zone Number',
    kind: 'integer', required: true,
    aliases: ['zone number', 'zone code', 'zone', 'area code'],
  },
  {
    key: 'type', label: 'Property Type',
    kind: 'enum', required: true, enumValues: ENUM_PROPERTY_TYPE,
    aliases: ['property type', 'unit type'],
  },
  {
    key: 'config', label: 'Property Subtype',
    kind: 'string', required: true, enumValues: UNIT_CONFIGS_FULL,
    aliases: ['property subtype', 'subtype', 'config', 'configuration', 'bhk'],
  },
  {
    key: 'furnishing', label: 'Furnishing Status',
    kind: 'enum', required: true, enumValues: ENUM_FURNISHING,
    aliases: ['furnishing status', 'furnishing', 'furnished'],
  },
  {
    key: 'rent', label: 'Rent (QAR / Monthly)',
    kind: 'numeric', required: false,
    aliases: ['rent qar monthly', 'rent', 'monthly rent', 'rate', 'price', 'rate no comm', 'rate no comm.'],
  },
  {
    key: 'status', label: 'Status',
    kind: 'enum', required: false, enumValues: ENUM_STATUS,
    aliases: ['status', 'availability'],
  },
  {
    key: 'location_map_url', label: 'Map URL',
    kind: 'url', required: false,
    aliases: ['map url', 'location map url', 'map link', 'google maps'],
  },
  {
    key: 'media_url', label: 'Media Storage URL',
    kind: 'url', required: false,
    aliases: ['media storage url', 'media url', 'photos', 'images', 'gallery'],
  },
];

// ─── Batch-level fields — required downstream, absent from the master list ────

export const BATCH_FIELDS: MasterFieldDef[] = [
  { key: 'realtor_name', label: 'Realtor Name',  kind: 'string',  required: true, aliases: [] },
  { key: 'property',     label: 'Property Name', kind: 'string',  required: true, aliases: [] },
  { key: 'bathrooms',    label: 'Bathrooms',     kind: 'numeric', required: true, aliases: [] },
  { key: 'kitchen',      label: 'Kitchen',       kind: 'enum',    required: true, enumValues: ENUM_KITCHEN, aliases: [] },
];

// ─── Header normalization + mapping suggestion ────────────────────────────────

export function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/** Suggests which source header matches each master field. Never guesses a value — only a column pointer, always overridable, always allowed to stay null. */
export function suggestMapping(headers: string[]): Record<string, string | null> {
  const normHeaders = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  const result: Record<string, string | null> = {};
  for (const field of MASTER_FIELDS) {
    // Deliberately excludes field.key: dInges' keys are short native field names
    // (e.g. 'type', 'status', 'config') that collide with generic source headers
    // holding unrelated values (a "Type" column full of "1 BHK" config strings,
    // not the type enum). Every key already has an equivalent entry in aliases
    // where that match is actually intended — see MASTER_FIELDS above.
    const candidates = [field.label, ...field.aliases].map(normalizeHeader);
    const match = normHeaders.find((h) => candidates.includes(h.norm));
    result[field.key] = match ? match.raw : null;
  }
  return result;
}

// ─── Deterministic unit_code fallback ──────────────────────────────────────────

export function slugifyProperty(name: string): string {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 20);
  return slug || 'UNIT';
}

// ─── Type-casting + validation ────────────────────────────────────────────────

export type CastResult = { value: unknown; error?: string };

export function castAndValidateField(field: MasterFieldDef, rawValue: unknown): CastResult {
  const str = rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();

  if (str === '') {
    return { value: null, error: field.required ? `${field.label} is required` : undefined };
  }

  switch (field.kind) {
    case 'string': {
      if (field.enumValues && !field.enumValues.some((v) => v.toLowerCase() === str.toLowerCase())) {
        return { value: str, error: `Unrecognized ${field.label}: "${str}"` };
      }
      const canonical = field.enumValues?.find((v) => v.toLowerCase() === str.toLowerCase());
      return { value: canonical ?? str };
    }

    case 'integer': {
      const cleaned = str.replace(/[^\d-]/g, '');
      const n = parseInt(cleaned, 10);
      if (isNaN(n)) return { value: null, error: `Non-numeric value for ${field.label}: "${str}"` };
      return { value: n };
    }

    case 'numeric': {
      const cleaned = str.replace(/[^\d.-]/g, '');
      const n = parseFloat(cleaned);
      if (isNaN(n)) return { value: null, error: `Non-numeric value for ${field.label}: "${str}"` };
      if (n < 0) return { value: n, error: `${field.label} must be ≥ 0` };
      return { value: n };
    }

    case 'enum': {
      const canonical = field.enumValues?.find((v) => v.toLowerCase() === str.toLowerCase());
      if (!canonical) return { value: str, error: `Unmatched enum for ${field.label}: "${str}"` };
      return { value: canonical };
    }

    case 'url': {
      if (!/^https?:\/\/\S+$/i.test(str)) {
        return { value: str, error: `Broken URL for ${field.label}: "${str}"` };
      }
      return { value: str };
    }

    default:
      return { value: str };
  }
}

// ─── Final translation to dInges' native record shape ─────────────────────────

/** values keys: master field keys + batch field keys + 'zone' + 'unit_code' (already cast). Output keys equal dInges' own field names directly (no DB-column translation needed). */
export function toIngestRecord(values: Record<string, unknown>): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const f of [...MASTER_FIELDS, ...BATCH_FIELDS]) {
    if (f.key in values) record[f.key] = values[f.key] ?? null;
  }
  if ('zone' in values) record.zone = values.zone;
  if ('unit_code' in values) record.unit_code = values.unit_code;
  return record;
}
