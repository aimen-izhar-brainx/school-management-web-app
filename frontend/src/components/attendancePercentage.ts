/**
 * Null-safe attendance percentage — avoids NaN/divide-by-zero when nothing's been marked yet.
 * Mirrors the formula `monthlyStatsForSection` (in `data/attendance.ts`) already uses, so a
 * caller working from a raw marked/total count (e.g. MyAttendancePage) doesn't re-derive it.
 */
export function calculateAttendancePercentage(markedCount: number, totalCount: number): number | null {
  return totalCount > 0 ? Math.round((markedCount / totalCount) * 100) : null
}

/** Shared display format for a nullable attendance percentage — used by AttendancePage and MyAttendancePage. */
export function formatAttendancePercentage(percentage: number | null): string {
  return percentage === null ? '—' : `${percentage}%`
}
