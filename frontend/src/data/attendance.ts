import { SECTION_OPTIONS, type SectionOption } from './timetable'

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

export interface AttendanceStudent {
  id: string
  name: string
  rollNumber: string
}

/** Seed rosters, keyed by the same section ids used in `data/timetable.ts` so both features stay in sync. */
export const SECTION_ROSTERS: Record<string, AttendanceStudent[]> = {
  'grade5-a': [
    { id: 'st-501', name: 'Ava Thompson', rollNumber: '501' },
    { id: 'st-502', name: 'Liam Chen', rollNumber: '502' },
    { id: 'st-503', name: 'Noah Patel', rollNumber: '503' },
    { id: 'st-504', name: 'Sophia Martinez', rollNumber: '504' },
    { id: 'st-505', name: 'Mason Reilly', rollNumber: '505' },
  ],
  'grade5-b': [
    { id: 'st-506', name: 'Emma Garcia', rollNumber: '506' },
    { id: 'st-507', name: 'Oliver Wright', rollNumber: '507' },
    { id: 'st-508', name: 'Isabella Moore', rollNumber: '508' },
    { id: 'st-509', name: 'Ethan Clark', rollNumber: '509' },
  ],
  'grade6-a': [
    { id: 'st-601', name: 'Isla Novak', rollNumber: '601' },
    { id: 'st-602', name: 'Mateo Alvarez', rollNumber: '602' },
    { id: 'st-603', name: 'Chloe Bennett', rollNumber: '603' },
    { id: 'st-604', name: 'Lucas Ferreira', rollNumber: '604' },
  ],
}

export function rosterFor(sectionId: string): AttendanceStudent[] {
  return SECTION_ROSTERS[sectionId] ?? []
}

export function findStudentSection(studentId: string): SectionOption | null {
  return SECTION_OPTIONS.find((section) => rosterFor(section.id).some((student) => student.id === studentId)) ?? null
}

/** Matches a logged-in student to a roster entry by name — there is no account-to-student link yet. */
export function findStudentByName(name: string): AttendanceStudent | null {
  const target = name.trim().toLowerCase()
  for (const section of SECTION_OPTIONS) {
    const match = rosterFor(section.id).find((student) => student.name.toLowerCase() === target)
    if (match) return match
  }
  return null
}

/** First roster entry overall — the fallback used when no name match exists (e.g. for a parent account). */
export function defaultStudent(): AttendanceStudent {
  for (const section of SECTION_OPTIONS) {
    const roster = rosterFor(section.id)
    if (roster.length > 0) return roster[0]
  }
  throw new Error('No students configured')
}

export interface AttendanceEdit {
  studentId: string
  from: AttendanceStatus
  to: AttendanceStatus
  editedBy: string
  editedAt: string
}

export interface AttendanceRecord {
  sectionId: string
  date: string
  entries: Record<string, AttendanceStatus>
  submittedBy: string
  submittedAt: string
  locked: boolean
  editLog: AttendanceEdit[]
}

export function attendanceKey(sectionId: string, date: string): string {
  return `${sectionId}__${date}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function getTodayKey(): string {
  return toDateKey(new Date())
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

/** Weekday (Mon–Fri) dates in a given `yyyy-mm` month, as date keys, earliest first. */
export function weekdaysInMonth(monthKey: string): string[] {
  const [year, month] = monthKey.split('-').map(Number)
  const dates: string[] = []
  const cursor = new Date(year, month - 1, 1)
  while (cursor.getMonth() === month - 1) {
    if (!isWeekend(cursor)) dates.push(toDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
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

function mulberry32(seed: number) {
  let state = seed
  return function random() {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return hash
}

function pickStatus(random: number): AttendanceStatus {
  if (random < 0.88) return 'present'
  if (random < 0.96) return 'absent'
  return 'leave'
}

/**
 * Seeds the last few weeks of attendance so reports and history views have something to show.
 * Today is left unmarked so the mark-attendance flow has something to do.
 */
function buildSeedRecords(): Record<string, AttendanceRecord> {
  const records: Record<string, AttendanceRecord> = {}
  const days = recentSchoolDays(15)

  for (const section of SECTION_OPTIONS) {
    const roster = rosterFor(section.id)
    if (roster.length === 0) continue

    for (const date of days) {
      const random = mulberry32(hashString(`${section.id}-${date}`))
      const entries: Record<string, AttendanceStatus> = {}
      for (const student of roster) {
        entries[student.id] = pickStatus(random())
      }

      records[attendanceKey(section.id, date)] = {
        sectionId: section.id,
        date,
        entries,
        submittedBy: 'Class teacher',
        submittedAt: new Date(`${date}T08:45:00`).toISOString(),
        locked: true,
        editLog: [],
      }
    }
  }

  return records
}

/** Seed data keyed by `sectionId__date`, so the marking, admin and student views start in sync. */
export const INITIAL_ATTENDANCE_RECORDS: Record<string, AttendanceRecord> = buildSeedRecords()

export function summarizeEntries(entries: Record<string, AttendanceStatus>): Record<AttendanceStatus, number> {
  const summary: Record<AttendanceStatus, number> = { present: 0, absent: 0, leave: 0 }
  for (const status of Object.values(entries)) summary[status] += 1
  return summary
}

/** Total enrolled students across every section — used by the admin dashboard overview. */
export function totalStudentCount(): number {
  return SECTION_OPTIONS.reduce((sum, section) => sum + rosterFor(section.id).length, 0)
}

export interface SchoolAttendanceSummary {
  present: number
  absent: number
  leave: number
  markedSections: number
  totalSections: number
}

/** School-wide present/absent/leave counts for a date, used by the admin dashboard overview. */
export function schoolAttendanceSummary(
  records: Record<string, AttendanceRecord>,
  date: string,
): SchoolAttendanceSummary {
  const summary: SchoolAttendanceSummary = {
    present: 0,
    absent: 0,
    leave: 0,
    markedSections: 0,
    totalSections: SECTION_OPTIONS.length,
  }

  for (const section of SECTION_OPTIONS) {
    const record = records[attendanceKey(section.id, date)]
    if (!record) continue
    summary.markedSections += 1
    const counts = summarizeEntries(record.entries)
    summary.present += counts.present
    summary.absent += counts.absent
    summary.leave += counts.leave
  }

  return summary
}

export interface MonthlyStudentStat {
  student: AttendanceStudent
  present: number
  absent: number
  leave: number
  markedDays: number
  percentage: number | null
}

/** Monthly per-student stats for a section, used by the admin report and driven off whatever `records` the caller holds. */
export function monthlyStatsForSection(
  records: Record<string, AttendanceRecord>,
  sectionId: string,
  monthKey: string,
): MonthlyStudentStat[] {
  const roster = rosterFor(sectionId)
  const days = weekdaysInMonth(monthKey)

  return roster.map((student) => {
    let present = 0
    let absent = 0
    let leave = 0
    let markedDays = 0

    for (const date of days) {
      const status = records[attendanceKey(sectionId, date)]?.entries[student.id]
      if (!status) continue
      markedDays += 1
      if (status === 'present') present += 1
      else if (status === 'absent') absent += 1
      else leave += 1
    }

    return {
      student,
      present,
      absent,
      leave,
      markedDays,
      percentage: markedDays > 0 ? Math.round((present / markedDays) * 100) : null,
    }
  })
}

export interface StudentDayEntry {
  date: string
  status: AttendanceStatus
}

/** One student's marked days within a month, earliest first — powers the student/parent view. */
export function studentMonthEntries(
  records: Record<string, AttendanceRecord>,
  sectionId: string,
  studentId: string,
  monthKey: string,
): StudentDayEntry[] {
  const entries: StudentDayEntry[] = []
  for (const date of weekdaysInMonth(monthKey)) {
    const status = records[attendanceKey(sectionId, date)]?.entries[studentId]
    if (status) entries.push({ date, status })
  }
  return entries
}
