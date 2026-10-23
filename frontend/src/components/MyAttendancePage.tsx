import { CalendarCheck2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { currentMonthKey, formatDateLabel, monthLabel } from '../data/attendance'
import type { AuthUser } from '../lib/auth'
import { getMyMonth, type StudentMonth } from '../lib/attendance'
import { AttendanceList } from './AttendanceList'
import { AttendanceStatusBadge } from './AttendanceStatusBadge'
import { formatAttendancePercentage } from './attendancePercentage'
import { DashboardShell } from './DashboardShell'

interface MyAttendancePageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

/**
 * Read-only monthly attendance record for a student. There is no parent-to-student link yet,
 * so a parent account has no child to show.
 */
export function MyAttendancePage({ user, onBack, onSignOut }: MyAttendancePageProps) {
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [month, setMonth] = useState<StudentMonth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(user.role === 'student')

  useEffect(() => {
    if (user.role !== 'student') return
    let active = true
    setLoading(true)
    setError(null)
    getMyMonth(monthKey)
      .then((result) => {
        if (active) setMonth(result)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your attendance.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [monthKey, user.role])

  const entries = month?.records.map((record) => ({ date: record.date.slice(0, 10), status: record.status })) ?? []
  const summary = month?.summary
  const present = summary?.present ?? 0
  const absent = summary?.absent ?? 0
  const leave = summary?.leave ?? 0
  const percentage = summary?.percentage ?? null
  const section = month?.student?.section
  const sectionName = section ? `${section.schoolClass.name} - ${section.name}` : null

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">My attendance</h1>
      <p className="mt-1 text-sm text-slate-500">
        {user.role === 'parent'
          ? 'Your child’s attendance will appear here once their account is linked to yours.'
          : `Your attendance record${sectionName ? ` for ${sectionName}` : ''}.`}
      </p>

      {error && (
        <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

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

      <AttendanceList isEmpty={!loading && entries.length === 0} emptyMessage="No attendance marked for this month yet.">
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
