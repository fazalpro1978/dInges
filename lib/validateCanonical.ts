import { MASTER_FIELDS } from './importSchema';

export interface SchemaError {
  field: string;
  label: string;
  rule: 'required' | 'enum';
  value?: unknown;
  allowed?: readonly string[];
}

export interface SchemaResult {
  valid: boolean;
  errors: SchemaError[];
}

/**
 * Validates a resolved payload against the canonical schema defined in importSchema.ts.
 * Called at the API boundary in /api/approve before writing to vetted_records —
 * ensures validation happens exactly once, inside dInges, never repeated in REIMS.
 */
export function validateCanonical(payload: Record<string, unknown>): SchemaResult {
  const errors: SchemaError[] = [];

  for (const field of MASTER_FIELDS) {
    const val = payload[field.key];
    const str = val === null || val === undefined ? '' : String(val).trim();

    if (field.required && str === '') {
      errors.push({ field: field.key, label: field.label, rule: 'required' });
      continue;
    }

    if (field.kind === 'enum' && field.enumValues && str !== '') {
      const matched = field.enumValues.find(v => v.toLowerCase() === str.toLowerCase());
      if (!matched) {
        errors.push({ field: field.key, label: field.label, rule: 'enum', value: val, allowed: field.enumValues });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function schemaErrorSummary(errors: SchemaError[]): string {
  return errors.map(e =>
    e.rule === 'required'
      ? `${e.label} is required`
      : `${e.label}: "${e.value}" not in [${e.allowed?.join(', ')}]`
  ).join(' · ');
}
