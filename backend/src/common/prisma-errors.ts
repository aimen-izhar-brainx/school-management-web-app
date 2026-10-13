export function prismaErrorCode(e: unknown): string | undefined {
  return (e as { code?: string } | null)?.code;
}

// 'TimetableEntry_teacherId_periodId_dayOfWeek_key' -> ['teacherId', 'periodId', 'dayOfWeek'].
function fieldsFromIndexName(name: string): string[] | null {
  const match = /^[^_]+_(.+)_(?:key|fkey|pkey|idx)$/.exec(name);
  return match ? match[1].split('_') : null;
}

function fieldsFromName(name: string): string[] {
  return fieldsFromIndexName(name.trim().split(/\s+/)[0]) ?? [name];
}

function asStrings(v: unknown): string[] | null {
  if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string')) return v;
  return null;
}

// The columns of the violated constraint, or null when they cannot be determined.
// Sources, in order: meta.driverAdapterError.cause.constraint ({ fields } or { index }),
// meta.target (array or index name), meta.field_name (older engines).
export function violatedConstraintFields(e: unknown): string[] | null {
  const meta = (e as { meta?: Record<string, unknown> } | null)?.meta;
  if (!meta || typeof meta !== 'object') return null;

  const constraint = (
    meta.driverAdapterError as
      { cause?: { constraint?: { fields?: unknown; index?: unknown } } } | undefined
  )?.cause?.constraint;
  const fields = asStrings(constraint?.fields);
  if (fields) return fields;
  if (typeof constraint?.index === 'string') return fieldsFromName(constraint.index);

  const target = asStrings(meta.target);
  if (target) return target;
  if (typeof meta.target === 'string') return fieldsFromName(meta.target);

  if (typeof meta.field_name === 'string') return fieldsFromName(meta.field_name);
  return null;
}
