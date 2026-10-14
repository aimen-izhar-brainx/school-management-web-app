import { CircleCheck, Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  ATTENDANCE_STATUSES,
  formatDateLabel,
  formatDateTimeLabel,
  getTodayKey,
  statusInfo,
  summarizeEntries,
  type AttendanceStatus,
} from '../data/attendance'
import type { AuthUser } from '../lib/auth'
import { errorMessage } from '../lib/errorMessage'
import { api } from '../lib/http'
import { DashboardShell } from './DashboardShell'

interface MarkAttendancePageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

interface NamedRow {
  id: string
  name: string
}

interface SectionRow extends NamedRow {
  classTeacher: NamedRow | null
}

interface SectionChoice {
  id: string
  label: string
}

interface AttendanceEntryRow {
  student: NamedRow
  status: AttendanceStatus | null
}

interface AttendanceDayResponse {
  submitted: boolean
  locked: boolean
  submittedBy?: NamedRow
  submittedAt?: string
  entries: AttendanceEntryRow[]
}

interface SubmitResponse {
  entries: { studentId: string; status: AttendanceStatus }[]
  submittedBy: NamedRow
  submittedAt: string
  locked: boolean
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/** A full `YYYY-MM-DD` calendar date — guards against the date input being cleared (empty string). */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function isValidDateKey(value: string): boolean {
  return DATE_RE.test(value)
}

/** Every roster student, defaulted to "present" wherever no status has been saved yet. */
function draftFromEntries(entries: AttendanceEntryRow[]): Record<string, AttendanceStatus> {
  const draft: Record<string, AttendanceStatus> = {}
  for (const entry of entries) draft[entry.student.id] = entry.status ?? 'present'
  return draft
}

/** Teacher-only screen for marking daily attendance, wired to the real attendance API (T-033). */
export function MarkAttendancePage({ user, onBack, onSignOut }: MarkAttendancePageProps) {
  const [sections, setSections] = useState<SectionChoice[]>([])
  const [directoryStatus, setDirectoryStatus] = useState<LoadStatus>('loading')
  const [directoryError, setDirectoryError] = useState<string | null>(null)

  const [sectionId, setSectionId] = useState('')
  const [date, setDate] = useState(getTodayKey())

  const [day, setDay] = useState<AttendanceDayResponse | null>(null)
  const [dayStatus, setDayStatus] = useState<LoadStatus>('idle')
  const [dayError, setDayError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const isMounted = useRef(true)
  const latestDirectoryRequest = useRef(0)
  const latestDayRequest = useRef(0)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    const request = ++latestDirectoryRequest.current
    async function loadDirectory() {
      try {
        const classes = await api.get<NamedRow[]>('/classes')
        const sectionLists = await Promise.all(
          classes.map((klass) => api.get<SectionRow[]>(`/classes/${klass.id}/sections`)),
        )
        if (!isMounted.current || request !== latestDirectoryRequest.current) return

        const owned: SectionChoice[] = []
        classes.forEach((klass, index) => {
          for (const section of sectionLists[index]) {
            if (section.classTeacher?.id === user.id) {
              owned.push({ id: section.id, label: `${klass.name} - ${section.name}` })
            }
          }
        })
        setSections(owned)
        setDirectoryStatus('ready')
        if (owned.length > 0) setSectionId(owned[0].id)
      } catch (error) {
        if (!isMounted.current || request !== latestDirectoryRequest.current) return
        setDirectoryError(errorMessage(error))
        setDirectoryStatus('error')
      }
    }
    void loadDirectory()
  }, [user.id])

  useEffect(() => {
    if (!sectionId) return
    // Clearing the date input makes `date` an empty string (or, in principle, some other
    // incomplete value) — don't fire a request to a malformed `/days/` URL for it.
    if (!isValidDateKey(date)) return
    const request = ++latestDayRequest.current

    async function loadDay() {
      setDayStatus('loading')
      setDayError(null)
      setEditing(false)
      setSubmitError(null)
      try {
        const data = await api.get<AttendanceDayResponse>(`/attendance/sections/${sectionId}/days/${date}`)
        if (!isMounted.current || request !== latestDayRequest.current) return
        setDay(data)
        setDraft(draftFromEntries(data.entries))
        setDayStatus('ready')
      } catch (error) {
        if (!isMounted.current || request !== latestDayRequest.current) return
        setDayError(errorMessage(error))
        setDayStatus('error')
      }
    }
    void loadDay()
  }, [sectionId, date])

  const roster = day?.entries ?? []
  const summaryCounts =
    day?.submitted
      ? summarizeEntries(Object.fromEntries(day.entries.map((entry) => [entry.student.id, entry.status as AttendanceStatus])))
      : null

  const setStudentStatus = (studentId: string, status: AttendanceStatus) => {
    setDraft((prev) => ({ ...prev, [studentId]: status }))
  }

  const markAllPresent = () => {
    const next: Record<string, AttendanceStatus> = {}
    for (const entry of roster) next[entry.student.id] = 'present'
    setDraft(next)
  }

  const startEdit = () => {
    if (!day) return
    setDraft(draftFromEntries(day.entries))
    setSubmitError(null)
    setEditing(true)
  }

  const handleSave = async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const entries = roster.map((entry) => ({
        studentId: entry.student.id,
        status: draft[entry.student.id] ?? 'present',
      }))
      const response = await api.put<SubmitResponse>(`/attendance/sections/${sectionId}/days/${date}`, { entries })
      if (!isMounted.current) return

      const statusByStudent = new Map(response.entries.map((entry) => [entry.studentId, entry.status]))
      const updatedEntries: AttendanceEntryRow[] = roster.map((entry) => ({
        student: entry.student,
        status: statusByStudent.get(entry.student.id) ?? null,
      }))
      setDay({
        submitted: true,
        locked: response.locked,
        submittedBy: response.submittedBy,
        submittedAt: response.submittedAt,
        entries: updatedEntries,
      })
      setDraft(draftFromEntries(updatedEntries))
      setEditing(false)
    } catch (error) {
      if (!isMounted.current) return
      setSubmitError(errorMessage(error))
    } finally {
      if (isMounted.current) setSubmitting(false)
    }
  }

  const today = getTodayKey()
  const showEditableForm = roster.length > 0 && day && ((!day.submitted && !day.locked) || editing)
  const showSummary = roster.length > 0 && day && day.submitted && !day.locked && !editing
  const showLocked = roster.length > 0 && day && day.submitted && day.locked
  const showNoDataLocked = roster.length > 0 && day && !day.submitted && day.locked && !editing

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Mark attendance</h1>
      <p className="mt-1 text-sm text-slate-500">Mark Present, Absent or Leave for each student, per class, per day.</p>

      {directoryStatus === 'loading' && <p className="mt-8 text-sm text-slate-500">Loading...</p>}
      {directoryStatus === 'error' && (
        <p role="alert" className="mt-8 text-sm text-red-600">
          {directoryError}
        </p>
      )}

      {directoryStatus === 'ready' && sections.length === 0 && (
        <p className="mt-8 text-sm text-slate-500">You are not the class teacher for any section.</p>
      )}

      {sections.length > 0 && (
        <>
          <div className="mt-8 flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="attendance-section" className="block text-xs font-medium text-slate-700">
                Class section
              </label>
              <select
                id="attendance-section"
                value={sectionId}
                onChange={(event) => setSectionId(event.target.value)}
                disabled={submitting}
                className="mt-1.5 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="attendance-date" className="block text-xs font-medium text-slate-700">
                Date
              </label>
              <input
                id="attendance-date"
                type="date"
                value={date}
                max={today}
                onChange={(event) => setDate(event.target.value)}
                disabled={submitting}
                className="mt-1.5 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>

          {dayStatus === 'loading' && <p className="mt-8 text-sm text-slate-500">Loading...</p>}
          {dayStatus === 'error' && (
            <p role="alert" className="mt-8 text-sm text-red-600">
              {dayError}
            </p>
          )}

          {dayStatus === 'ready' && day && (
            <>
              {roster.length === 0 && (
                <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  No students enrolled.
                </div>
              )}

              {showLocked && (
                <div className="mt-8">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Lock className="size-4 text-slate-400" />
                      Submitted
                    </div>
                    {day.submittedBy && day.submittedAt && (
                      <p className="text-xs text-slate-500">
                        Marked by {day.submittedBy.name} &middot; {formatDateTimeLabel(day.submittedAt)}
                      </p>
                    )}
                  </div>

                  <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                    {roster.map((entry) => {
                      const info = entry.status ? statusInfo(entry.status) : null
                      return (
                        <li key={entry.student.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <span className="text-slate-900">{entry.student.name}</span>
                          {info && (
                            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${info.badgeClass}`}>
                              {info.label}
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>

                  <p className="mt-3 text-xs text-slate-400">
                    This day is locked. Contact an admin if a correction is needed &mdash; edits are logged.
                  </p>
                </div>
              )}

              {showNoDataLocked && (
                <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  <Lock className="mx-auto size-4 text-slate-400" />
                  <p className="mt-2">No attendance was recorded for this day.</p>
                  <p className="mt-1 text-xs text-slate-400">
                    This day is locked. Contact an admin if a correction is needed &mdash; edits are logged.
                  </p>
                </div>
              )}

              {showSummary && summaryCounts && (
                <div className="mt-8">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <CircleCheck className="size-4 text-emerald-500" />
                      Submitted
                    </div>
                    {day.submittedBy && day.submittedAt && (
                      <p className="text-xs text-slate-500">
                        Marked by {day.submittedBy.name} &middot; {formatDateTimeLabel(day.submittedAt)}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-2">
                      {ATTENDANCE_STATUSES.map((status) => (
                        <span
                          key={status.id}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${status.badgeClass}`}
                        >
                          <span className={`size-1.5 rounded-full ${status.dotClass}`} />
                          {status.label} &middot; {summaryCounts[status.id]}
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={startEdit}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              )}

              {showEditableForm && (
                <div className="mt-8">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-700">
                      {formatDateLabel(date)}
                    </h2>
                    <button
                      type="button"
                      onClick={markAllPresent}
                      className="text-xs font-medium text-violet-600 transition-colors hover:text-violet-700"
                    >
                      Mark all present
                    </button>
                  </div>

                  <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                    {roster.map((entry) => (
                      <li key={entry.student.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <p className="text-sm font-medium text-slate-900">{entry.student.name}</p>
                        <div className="flex gap-1.5">
                          {ATTENDANCE_STATUSES.map((status) => {
                            const active = draft[entry.student.id] === status.id
                            return (
                              <button
                                key={status.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setStudentStatus(entry.student.id, status.id)}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                  active ? status.activeClass : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                              >
                                {status.label}
                              </button>
                            )
                          })}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {submitError && (
                    <p role="alert" className="mt-3 text-sm text-red-600">
                      {submitError}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={submitting}
                    className="mt-4 flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CircleCheck className="size-4" />
                    {day.submitted ? 'Save changes' : 'Submit attendance'}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </DashboardShell>
  )
}
