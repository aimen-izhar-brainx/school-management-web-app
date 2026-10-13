// Source of truth for the fixed school-day schedule (T-020).
// The migration `*_add_period/migration.sql` repeats these rows as SQL; keep both in sync.
export const FIXED_PERIODS = [
  { id: 'period-1', order: 1, label: 'Period 1', startTime: '08:00', endTime: '08:45', isBreak: false },
  { id: 'period-2', order: 2, label: 'Period 2', startTime: '08:45', endTime: '09:30', isBreak: false },
  { id: 'period-3', order: 3, label: 'Period 3', startTime: '09:30', endTime: '10:15', isBreak: false },
  { id: 'recess', order: 4, label: 'Recess', startTime: '10:15', endTime: '10:45', isBreak: true },
  { id: 'period-4', order: 5, label: 'Period 4', startTime: '10:45', endTime: '11:30', isBreak: false },
  { id: 'period-5', order: 6, label: 'Period 5', startTime: '11:30', endTime: '12:15', isBreak: false },
  { id: 'period-6', order: 7, label: 'Period 6', startTime: '12:15', endTime: '13:00', isBreak: false },
] as const;
