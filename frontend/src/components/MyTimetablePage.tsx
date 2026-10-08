import {
  DAYS,
  DEFAULT_PERIODS,
  INITIAL_TIMETABLES,
  SECTION_OPTIONS,
  TEACHERS,
  sectionLabel,
  teacherName,
  type DayId,
} from '../data/timetable'
import type { AuthUser } from '../lib/auth'
import { DashboardShell } from './DashboardShell'

interface MyTimetablePageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

function formatTime(time: string): string {
  const [hourString, minute] = time.split(':')
  const hour = Number(hourString)
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${minute} ${period}`
}

interface ScheduleCell {
  subject: string
  caption: string
}

/**
 * Builds a per-period, per-day lookup for the current viewer.
 * Students see their home section's timetable; teachers see every slot they
 * are assigned across all sections, pulled from the same seed data the admin
 * builder edits (there is no account-to-teacher link yet, so the mock
 * teacher is matched by name, falling back to the first one).
 */
function useSchedule(user: AuthUser): { grid: Partial<Record<string, Partial<Record<DayId, ScheduleCell>>>>; caption: string } {
  if (user.role === 'student') {
    const section = SECTION_OPTIONS[0]
    const sectionGrid = INITIAL_TIMETABLES[section.id] ?? {}
    const grid: Partial<Record<string, Partial<Record<DayId, ScheduleCell>>>> = {}

    for (const [periodId, dayEntries] of Object.entries(sectionGrid)) {
      const row: Partial<Record<DayId, ScheduleCell>> = {}
      for (const day of DAYS) {
        const entry = dayEntries?.[day.id]
        if (entry) row[day.id] = { subject: entry.subject, caption: teacherName(entry.teacherId) ?? 'Unassigned' }
      }
      grid[periodId] = row
    }

    return { grid, caption: sectionLabel(section) }
  }

  const matchedTeacher =
    TEACHERS.find((teacher) => teacher.name.toLowerCase() === user.name.toLowerCase()) ?? TEACHERS[0]
  const grid: Partial<Record<string, Partial<Record<DayId, ScheduleCell>>>> = {}

  for (const section of SECTION_OPTIONS) {
    const sectionGrid = INITIAL_TIMETABLES[section.id] ?? {}
    for (const [periodId, dayEntries] of Object.entries(sectionGrid)) {
      for (const day of DAYS) {
        const entry = dayEntries?.[day.id]
        if (entry && entry.teacherId === matchedTeacher.id) {
          grid[periodId] = { ...grid[periodId], [day.id]: { subject: entry.subject, caption: sectionLabel(section) } }
        }
      }
    }
  }

  return { grid, caption: matchedTeacher.name }
}

/** Read-only weekly timetable for teachers and students. */
export function MyTimetablePage({ user, onBack, onSignOut }: MyTimetablePageProps) {
  const { grid, caption } = useSchedule(user)
  const isTeacher = user.role === 'teacher'

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-6xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">My timetable</h1>
      <p className="mt-1 text-sm text-slate-500">
        {isTeacher
          ? `Your weekly teaching schedule across classes, shown for ${caption}.`
          : `Weekly class schedule for ${caption}.`}
      </p>

      <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="w-28 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Time
              </th>
              {DAYS.map((day) => (
                <th key={day.id} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEFAULT_PERIODS.map((period) => {
              if (period.isBreak) {
                return (
                  <tr key={period.id} className="border-b border-slate-200 bg-amber-50/60">
                    <td colSpan={DAYS.length + 1} className="px-3 py-2 text-xs font-medium text-amber-700">
                      {period.breakLabel ?? 'Break'} &middot; {formatTime(period.startTime)} &ndash;{' '}
                      {formatTime(period.endTime)}
                    </td>
                  </tr>
                )
              }

              const periodRow = grid[period.id] ?? {}

              return (
                <tr key={period.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-3 py-2.5 text-xs font-medium text-slate-500">
                    {formatTime(period.startTime)}
                    <br />
                    {formatTime(period.endTime)}
                  </td>
                  {DAYS.map((day) => {
                    const cell = periodRow[day.id]
                    return (
                      <td key={day.id} className="px-2 py-2">
                        {cell ? (
                          <div className="rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-2">
                            <p className="text-xs font-semibold text-violet-900">{cell.subject}</p>
                            <p className="text-[11px] text-violet-500">{cell.caption}</p>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-slate-200 px-2.5 py-2 text-center text-[11px] text-slate-300">
                            Free
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  )
}
