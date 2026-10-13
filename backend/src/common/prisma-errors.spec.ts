import { describe, expect, it } from 'vitest';
import { prismaErrorCode, violatedConstraintFields } from './prisma-errors.js';

const withMeta = (meta: unknown) => ({ code: 'P2002', meta });

describe('violatedConstraintFields', () => {
  it('reads driverAdapterError constraint fields', () => {
    const e = withMeta({
      driverAdapterError: {
        cause: { constraint: { fields: ['teacherId', 'periodId'] } },
      },
    });
    expect(violatedConstraintFields(e)).toEqual(['teacherId', 'periodId']);
  });

  it('parses driverAdapterError constraint index names', () => {
    const e = withMeta({
      driverAdapterError: {
        cause: { constraint: { index: 'ClassSubject_teacherId_fkey' } },
      },
    });
    expect(violatedConstraintFields(e)).toEqual(['teacherId']);
  });

  it('reads meta.target as an array', () => {
    expect(violatedConstraintFields(withMeta({ target: ['sectionId', 'periodId'] }))).toEqual([
      'sectionId',
      'periodId',
    ]);
  });

  it('parses meta.target as an index name', () => {
    const e = withMeta({
      target: 'TimetableEntry_teacherId_periodId_dayOfWeek_key',
    });
    expect(violatedConstraintFields(e)).toEqual(['teacherId', 'periodId', 'dayOfWeek']);
  });

  it('falls back to meta.field_name', () => {
    expect(
      violatedConstraintFields(withMeta({ field_name: 'ClassSubject_classId_fkey (index)' })),
    ).toEqual(['classId']);
    expect(violatedConstraintFields(withMeta({ field_name: 'teacherId' }))).toEqual(['teacherId']);
  });

  it('does not substring-match: sectionId is not teacherId', () => {
    const fields = violatedConstraintFields(withMeta({ target: ['sectionId'] }));
    expect(fields?.includes('teacherId')).toBe(false);
  });

  it('returns null for non-Prisma errors and missing meta', () => {
    expect(violatedConstraintFields(new Error('boom'))).toBeNull();
    expect(violatedConstraintFields(null)).toBeNull();
    expect(violatedConstraintFields(undefined)).toBeNull();
    expect(violatedConstraintFields('x')).toBeNull();
    expect(violatedConstraintFields({ code: 'P2002', meta: {} })).toBeNull();
  });
});

describe('prismaErrorCode', () => {
  it('returns the code or undefined', () => {
    expect(prismaErrorCode({ code: 'P2003' })).toBe('P2003');
    expect(prismaErrorCode(null)).toBeUndefined();
  });
});
