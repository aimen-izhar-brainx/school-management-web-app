import { CalendarCheck2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
  type AttendanceStatus,
} from '../data/attendance'
import { sectionLabel } from '../data/timetable'
import type { AuthUser } from '../lib/auth'
import { errorMessage } from '../lib/errorMessage'
import { api } from '../lib/http'
import { AttendanceList } from './AttendanceList'
import { AttendanceStatusBadge } from './AttendanceStatusBadge'
import { calculateAttendancePercentage, formatAttendancePercentage } from './attendancePercentage'
import { DashboardShell } from './DashboardShell'

interface MyAttendancePageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

/** One marked day for the logged-in student, as returned by `GET /attendance/me` (T-038). */
interface MyAttendanceEntry {
  date: string
  status: AttendanceStatus
}

/**
 * `GET /attendance/me?month=` response shape (T-038's `attendance.service.ts#getMine`).
 * `section: null` means the student has no section assigned yet (AC-12.1).
 */
interface MyAttendanceResponse {
  section: { id: string; name: string } | null
  entries: MyAttendanceEntry[]
  present: number
  absent: number
  leave: number
  percentage: number | null
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/** A full `YYYY-MM` month key — guards against the month input being cleared (empty string). */
const MONTH_RE = /^\d{4}-\d{2}$/
function isValidMonthKey(value: string): boolean {
  return MONTH_RE.test(value)
}

/**
 * Matches a parent account to the student it belongs to by name, falling back to the first
 * enrolled student — the same approach `MyTimetablePage` uses for teachers. Per T-039's Technical
 * notes, the parent branch stays exactly as-is and unwired (parent access is deferred, see
 * `docs/plan.md`'s decisions log); only the student branch below is wired to the real API.
 */
function useLinkedStudent(user: AuthUser) {
  const matched = user.role === 'student' ? findStudentByName(user.name) : null
  return matched ?? defaultStudent()
}

interface AttendanceBodyProps {
  percentage: number | null
  present: number
  absent: number
  leave: number
  entries: MyAttendanceEntry[]
  monthKey: string
}

/** Stats grid + entry list shared by both the real student view and the still-mock parent view. */
function AttendanceBody({ percentage, present, absent, leave, entries, monthKey }: AttendanceBodyProps) {
  return (
    <>
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
    </>
  )
}

/**
 * Read-only monthly attendance view. Students are wired to the real `GET /attendance/me` endpoint
 * (T-039); the parent branch stays an unwired placeholder backed by mock data (deferred per
 * `docs/plan.md` — parent access is out of scope for v1) and must never call the real API.
 */
export function MyAttendancePage({ user, onBack, onSignOut }: MyAttendancePageProps) {
  const isStudent = user.role === 'student'
  const [monthKey, setMonthKey] = useState(currentMonthKey())

  // --- Parent branch: unchanged mock data, intentionally left unwired. ---
  const [records] = useState<Record<string, AttendanceRecord>>(INITIAL_ATTENDANCE_RECORDS)
  const linkedStudent = useLinkedStudent(user)
  const mockSection = findStudentSection(linkedStudent.id)
  const mockEntries = mockSection
    ? studentMonthEntries(records, mockSection.id, linkedStudent.id, monthKey)
    : []
  const mockPresent = mockEntries.filter((entry) => entry.status === 'present').length
  const mockAbsent = mockEntries.filter((entry) => entry.status === 'absent').length
  const mockLeave = mockEntries.filter((entry) => entry.status === 'leave').length
  const mockPercentage = calculateAttendancePercentage(mockPresent, mockEntries.length)

  // --- Student branch: real GET /attendance/me?month= (T-039), fetched on mount and month change. ---
  const [response, setResponse] = useState<MyAttendanceResponse | null>(null)
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const isMounted = useRef(true)
  const latestRequest = useRef(0)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    function resetStaleResponse() {
      setResponse(null)
      setStatus('idle')
      setError(null)
    }

    if (!isStudent) return
    // Clearing the month input makes `monthKey` an empty string — don't fire a request to a
    // malformed `/attendance/me` URL for it. Bump the request ref first so any still-in-flight
    // request for the previous (valid) month is marked stale and its response gets discarded
    // instead of repopulating the view after the input has since become invalid, and reset state
    // so stale stats/entries don't stay on screen next to `monthLabel('')` ("Invalid Date").
    if (!isValidMonthKey(monthKey)) {
      ++latestRequest.current
      resetStaleResponse()
      return
    }
    const request = ++latestRequest.current

    async function load() {
      setStatus('loading')
      setError(null)
      try {
        const data = await api.get<MyAttendanceResponse>(`/attendance/me?month=${monthKey}`)
        if (!isMounted.current || request !== latestRequest.current) return
        setResponse(data)
        setStatus('ready')
      } catch (fetchError) {
        if (!isMounted.current || request !== latestRequest.current) return
        setError(errorMessage(fetchError))
        setStatus('error')
      }
    }
    void load()
  }, [isStudent, monthKey])

  const section = response?.section ?? null

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">My attendance</h1>
      <p className="mt-1 text-sm text-slate-500">
        {user.role === 'parent'
          ? `Attendance record for ${linkedStudent.name}${mockSection ? `, ${sectionLabel(mockSection)}` : ''}.`
          : `Your attendance record${section ? ` for ${section.name}` : ''}.`}
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

      {!isStudent && (
        <AttendanceBody
          percentage={mockPercentage}
          present={mockPresent}
          absent={mockAbsent}
          leave={mockLeave}
          entries={mockEntries}
          monthKey={monthKey}
        />
      )}

      {isStudent && status === 'loading' && <p className="mt-8 text-sm text-slate-500">Loading...</p>}
      {isStudent && status === 'error' && (
        <p role="alert" className="mt-8 text-sm text-red-600">
          {error}
        </p>
      )}
      {isStudent && status === 'ready' && response && section === null && (
        <p className="mt-8 text-sm text-slate-500">You are not assigned to a class yet.</p>
      )}
      {isStudent && status === 'ready' && response && section !== null && (
        <AttendanceBody
          percentage={response.percentage}
          present={response.present}
          absent={response.absent}
          leave={response.leave}
          entries={response.entries}
          monthKey={monthKey}
        />
      )}
    </DashboardShell>
  )
}
