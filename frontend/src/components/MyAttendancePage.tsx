import { CalendarCheck2 } from 'lucide-react'
import { useState } from 'react'
import {
  INITIAL_ATTENDANCE_RECORDS,
  currentMonthKey,
  defaultStudent,
  findStudentByName,
  findStudentSection,
  formatDateLabel,
  monthLabel,
  studentMonthEntries,
  type AttendanceRecord,
} from '../data/attendance'
import { sectionLabel } from '../data/timetable'
import type { AuthUser } from '../lib/auth'
import { AttendanceList } from './AttendanceList'
import { AttendanceStatusBadge } from './AttendanceStatusBadge'
import { calculateAttendancePercentage, formatAttendancePercentage } from './attendancePercentage'
import { DashboardShell } from './DashboardShell'

interface MyAttendancePageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

/**
 * Read-only attendance view for the student it belongs to, or (for a parent) their child.
 * There is no account-to-student link yet, so a student is matched by name, falling back to
 * the first enrolled student — the same approach `MyTimetablePage` uses for teachers.
 */
function useLinkedStudent(user: AuthUser) {
  const matched = user.role === 'student' ? findStudentByName(user.name) : null
  return matched ?? defaultStudent()
}

/** Read-only monthly attendance record for students and parents. */
export function MyAttendancePage({ user, onBack, onSignOut }: MyAttendancePageProps) {
  const [records] = useState<Record<string, AttendanceRecord>>(INITIAL_ATTENDANCE_RECORDS)
  const [monthKey, setMonthKey] = useState(currentMonthKey())

  const student = useLinkedStudent(user)
  const section = findStudentSection(student.id)
  const entries = section ? studentMonthEntries(records, section.id, student.id, monthKey) : []

  const present = entries.filter((entry) => entry.status === 'present').length
  const absent = entries.filter((entry) => entry.status === 'absent').length
  const leave = entries.filter((entry) => entry.status === 'leave').length
  const percentage = calculateAttendancePercentage(present, entries.length)

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">My attendance</h1>
      <p className="mt-1 text-sm text-slate-500">
        {user.role === 'parent'
          ? `Attendance record for ${student.name}${section ? `, ${sectionLabel(section)}` : ''}.`
          : `Your attendance record${section ? ` for ${sectionLabel(section)}` : ''}.`}
      </p>

      <div className="mt-6">
        <label htmlFor="my-attendance-month" className="block text-xs font-medium text-slate-700">
          Month
        </label>
        <input
          id="my-attendance-month"
          type="month"
          value={monthKey}
          onChange={(event) => setMonthKey(event.target.value)}
          className="mt-1.5 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <CalendarCheck2 className="size-3.5" />
            Attendance
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatAttendancePercentage(percentage)}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium text-emerald-700">Present</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{present}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium text-red-700">Absent</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{absent}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium text-amber-700">Leave</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{leave}</p>
        </div>
      </div>

      <h2 className="mt-8 text-sm font-semibold text-slate-700">{monthLabel(monthKey)}</h2>

      <AttendanceList isEmpty={entries.length === 0} emptyMessage="No attendance marked for this month yet.">
        {[...entries].reverse().map((entry) => (
          <li key={entry.date} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-slate-700">{formatDateLabel(entry.date)}</span>
            <AttendanceStatusBadge status={entry.status} />
          </li>
        ))}
      </AttendanceList>
    </DashboardShell>
  )
}
