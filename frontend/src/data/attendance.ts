export type AttendanceStatus = 'present' | 'absent' | 'leave'

export interface AttendanceStatusInfo {
  id: AttendanceStatus
  label: string
  dotClass: string
  badgeClass: string
  activeClass: string
}

export const ATTENDANCE_STATUSES: AttendanceStatusInfo[] = [
  {
    id: 'present',
    label: 'Present',
    dotClass: 'bg-emerald-500',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    activeClass: 'border-emerald-600 bg-emerald-600 text-white',
  },
  {
    id: 'absent',
    label: 'Absent',
    dotClass: 'bg-red-500',
    badgeClass: 'border-red-200 bg-red-50 text-red-700',
    activeClass: 'border-red-600 bg-red-600 text-white',
  },
  {
    id: 'leave',
    label: 'Leave',
    dotClass: 'bg-amber-500',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
    activeClass: 'border-amber-600 bg-amber-600 text-white',
  },
]

export function statusInfo(status: AttendanceStatus): AttendanceStatusInfo {
  return ATTENDANCE_STATUSES.find((entry) => entry.id === status) ?? ATTENDANCE_STATUSES[0]
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// The backend validates attendance dates against the UTC day, so "today" must be UTC too.
export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

export function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTimeLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
}

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** The most recent school days (Mon–Fri) before today, most recent first. */
export function recentSchoolDays(count: number): string[] {
  const days: string[] = []
  const cursor = new Date()
  cursor.setDate(cursor.getDate() - 1)
  while (days.length < count) {
    if (!isWeekend(cursor)) days.push(toDateKey(cursor))
    cursor.setDate(cursor.getDate() - 1)
  }
  return days
}

/** Yesterday's school day, so report filters default to a date that already has data. */
export function mostRecentSchoolDay(): string {
  return recentSchoolDays(1)[0]
}
