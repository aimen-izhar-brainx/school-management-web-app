export const ENTRY_BASE_SELECT = {
  id: true,
  periodId: true,
  dayOfWeek: true,
  subject: { select: { id: true, name: true } },
} as const;

export const ENTRY_SELECT = {
  ...ENTRY_BASE_SELECT,
  teacher: { select: { id: true, name: true } },
} as const;

export const ENTRY_ORDER_BY = [
  { dayOfWeek: 'asc' },
  { period: { order: 'asc' } },
] as const;
