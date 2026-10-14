import { BarChart3, History, Lock, Pencil, Save, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  ATTENDANCE_STATUSES,
  currentMonthKey,
  formatDateLabel,
  formatDateTimeLabel,
  monthLabel,
  mostRecentSchoolDay,
  statusInfo,
  summarizeEntries,
  type AttendanceStatus,
} from '../data/attendance'
import type { AuthUser } from '../lib/auth'
import { compareByName } from '../lib/compareByName'
import { errorMessage } from '../lib/errorMessage'
import { api } from '../lib/http'
import { AttendanceList } from './AttendanceList'
import { AttendanceStatusBadge } from './AttendanceStatusBadge'
import { formatAttendancePercentage } from './attendancePercentage'
import { DashboardShell } from './DashboardShell'

interface AttendancePageProps {
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

interface AdminAttendanceEntryRow {
  student: NamedRow
  status: AttendanceStatus | null
}

interface AdminAttendanceEditRow {
  studentId: string
  fromStatus: AttendanceStatus
  toStatus: AttendanceStatus
  editedById: string
  editedBy?: NamedRow
  editedAt: string
}

interface AdminAttendanceDayResponse {
  submitted: boolean
  locked: boolean
  submittedBy?: NamedRow
  submittedAt?: string
  entries: AdminAttendanceEntryRow[]
  edits?: AdminAttendanceEditRow[]
}

/** One row of `GET /attendance/reports/daily` (T-036) — `summary === null` means nothing was submitted. */
interface DailySummaryReportRow {
  section: NamedRow
  summary: { present: number; absent: number; leave: number } | null
}

/** One row of `GET /attendance/reports/monthly` (T-036) — `percentage === null` means zero marked days. */
interface MonthlyPercentageReportRow {
  student: NamedRow
  present: number
  absent: number
  leave: number
  markedDays: number
  percentage: number | null
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/** A full `YYYY-MM-DD` calendar date — guards against the date input being cleared (empty string). */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function isValidDateKey(value: string): boolean {
  return DATE_RE.test(value)
}

/** A full `YYYY-MM` month key — guards against the month input being cleared (empty string). */
const MONTH_RE = /^\d{4}-\d{2}$/
function isValidMonthKey(value: string): boolean {
  return MONTH_RE.test(value)
}

/** Every roster student, defaulted to "present" wherever no status has been saved yet. */
function draftFromEntries(entries: AdminAttendanceEntryRow[]): Record<string, AttendanceStatus> {
  const draft: Record<string, AttendanceStatus> = {}
  for (const entry of entries) draft[entry.student.id] = entry.status ?? 'present'
  return draft
}

/**
 * Resolves the name shown for an audit row's editor. The backend joins `editedBy: { id, name }`
 * (T-035 gap fix) so a different admin's past edit always resolves to a real name; if that's ever
 * missing, fall back to the current user's own name when it's a self-edit (common right after
 * `saveEditing`), or the bare id as a last resort.
 */
function editorNameFor(edit: AdminAttendanceEditRow, user: AuthUser): string {
  if (edit.editedBy?.name) return edit.editedBy.name
  if (edit.editedById === user.id) return user.name
  return edit.editedById
}

/** Admin-only screen: browse & correct any class's attendance, plus basic daily/monthly reports. */
export function AttendancePage({ user, onBack, onSignOut }: AttendancePageProps) {
  const [sections, setSections] = useState<SectionChoice[]>([])
  const [directoryStatus, setDirectoryStatus] = useState<LoadStatus>('loading')
  const [directoryError, setDirectoryError] = useState<string | null>(null)

  const [browseSectionId, setBrowseSectionId] = useState('')
  const [browseDate, setBrowseDate] = useState(mostRecentSchoolDay())

  const [day, setDay] = useState<AdminAttendanceDayResponse | null>(null)
  const [dayStatus, setDayStatus] = useState<LoadStatus>('idle')
  const [dayError, setDayError] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<Record<string, AttendanceStatus>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [summaryDate, setSummaryDate] = useState(mostRecentSchoolDay())
  const [dailyReport, setDailyReport] = useState<DailySummaryReportRow[]>([])
  const [dailyReportStatus, setDailyReportStatus] = useState<LoadStatus>('idle')
  const [dailyReportError, setDailyReportError] = useState<string | null>(null)

  const [monthlySectionId, setMonthlySectionId] = useState('')
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [monthlyReport, setMonthlyReport] = useState<MonthlyPercentageReportRow[]>([])
  const [monthlyReportStatus, setMonthlyReportStatus] = useState<LoadStatus>('idle')
  const [monthlyReportError, setMonthlyReportError] = useState<string | null>(null)

  const isMounted = useRef(true)
  const latestDirectoryRequest = useRef(0)
  const latestDayRequest = useRef(0)
  const latestDailyReportRequest = useRef(0)
  const latestMonthlyReportRequest = useRef(0)

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
        const sortedClasses = [...classes].sort(compareByName)
        const sectionLists = await Promise.all(
          sortedClasses.map((row) => api.get<SectionRow[]>(`/classes/${row.id}/sections`)),
        )
        if (!isMounted.current || request !== latestDirectoryRequest.current) return

        const flat: SectionChoice[] = sortedClasses.flatMap((row, index) =>
          [...sectionLists[index]]
            .sort(compareByName)
            .map((section) => ({ id: section.id, label: `${row.name} - ${section.name}` })),
        )
        setSections(flat)
        setDirectoryStatus('ready')
        if (flat.length > 0) {
          setBrowseSectionId(flat[0].id)
          setMonthlySectionId(flat[0].id)
        }
      } catch (error) {
        if (!isMounted.current || request !== latestDirectoryRequest.current) return
        setDirectoryError(errorMessage(error))
        setDirectoryStatus('error')
      }
    }
    void loadDirectory()
  }, [])

  useEffect(() => {
    // Clears any previously loaded day so the stale roster doesn't stay on screen (with
    // "Edit this day" still enabled) once the section/date no longer points at it.
    function resetStaleDay() {
      setDay(null)
      setDayStatus('idle')
      setIsEditing(false)
    }

    if (!browseSectionId) return
    // Clearing the date input makes `browseDate` an empty string — don't fire a request to a
    // malformed `/days/` URL for it.
    if (!isValidDateKey(browseDate)) {
      resetStaleDay()
      return
    }
    const request = ++latestDayRequest.current

    async function loadDay() {
      setDayStatus('loading')
      setDayError(null)
      // Leaving edit mode when the section/date changes avoids silently editing the wrong day.
      setIsEditing(false)
      setSaveError(null)
      try {
        const data = await api.get<AdminAttendanceDayResponse>(
          `/attendance/admin/sections/${browseSectionId}/days/${browseDate}`,
        )
        if (!isMounted.current || request !== latestDayRequest.current) return
        setDay(data)
        setDayStatus('ready')
      } catch (error) {
        if (!isMounted.current || request !== latestDayRequest.current) return
        setDayError(errorMessage(error))
        setDayStatus('error')
      }
    }
    void loadDay()
  }, [browseSectionId, browseDate])

  // Daily/monthly reports (T-037) are fetched on mount and whenever their inputs change, mirroring
  // `loadDay`'s effect above for "Browse & edit" — including its request-id-ref-guard idiom, which
  // discards a stale in-flight response if the inputs change again before it resolves.
  useEffect(() => {
    function resetStaleDailyReport() {
      setDailyReport([])
      setDailyReportStatus('idle')
    }

    // Clearing the date input makes `summaryDate` an empty string — don't fire a request to a
    // malformed `/reports/daily` URL for it. Bump the request ref first so any still-in-flight
    // request for the previous (valid) date is marked stale and its response gets discarded.
    if (!isValidDateKey(summaryDate)) {
      ++latestDailyReportRequest.current
      resetStaleDailyReport()
      return
    }
    const request = ++latestDailyReportRequest.current

    async function loadDailyReport() {
      setDailyReportStatus('loading')
      setDailyReportError(null)
      try {
        const query = new URLSearchParams({ date: summaryDate }).toString()
        const data = await api.get<DailySummaryReportRow[]>(`/attendance/reports/daily?${query}`)
        if (!isMounted.current || request !== latestDailyReportRequest.current) return
        setDailyReport(data)
        setDailyReportStatus('ready')
      } catch (error) {
        if (!isMounted.current || request !== latestDailyReportRequest.current) return
        setDailyReportError(errorMessage(error))
        setDailyReportStatus('error')
      }
    }
    void loadDailyReport()
  }, [summaryDate])

  useEffect(() => {
    function resetStaleMonthlyReport() {
      setMonthlyReport([])
      setMonthlyReportStatus('idle')
    }

    // Bump the request ref first so any still-in-flight request for the previous (valid)
    // section/month is marked stale and its response gets discarded instead of repopulating the
    // table after the inputs have since become invalid.
    if (!monthlySectionId || !isValidMonthKey(monthKey)) {
      ++latestMonthlyReportRequest.current
      resetStaleMonthlyReport()
      return
    }
    const request = ++latestMonthlyReportRequest.current

    async function loadMonthlyReport() {
      setMonthlyReportStatus('loading')
      setMonthlyReportError(null)
      try {
        const query = new URLSearchParams({ sectionId: monthlySectionId, month: monthKey }).toString()
        const data = await api.get<MonthlyPercentageReportRow[]>(`/attendance/reports/monthly?${query}`)
        if (!isMounted.current || request !== latestMonthlyReportRequest.current) return
        setMonthlyReport(data)
        setMonthlyReportStatus('ready')
      } catch (error) {
        if (!isMounted.current || request !== latestMonthlyReportRequest.current) return
        setMonthlyReportError(errorMessage(error))
        setMonthlyReportStatus('error')
      }
    }
    void loadMonthlyReport()
  }, [monthlySectionId, monthKey])

  const roster = day?.entries ?? []
  const browseCounts = day?.submitted
    ? summarizeEntries(Object.fromEntries(roster.map((entry) => [entry.student.id, entry.status as AttendanceStatus])))
    : null
  const canEdit =
    dayStatus === 'ready' && !!day && day.submitted && roster.length > 0 && isValidDateKey(browseDate)

  const startEditing = () => {
    if (!day) return
    setEditDraft(draftFromEntries(day.entries))
    setSaveError(null)
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditDraft({})
    setSaveError(null)
  }

  const saveEditing = async () => {
    // Guards against a save ever firing with a malformed/empty date, even if some other path
    // left `isEditing` true (belt-and-braces alongside the `canEdit` gate above).
    if (!day || !isValidDateKey(browseDate)) return
    setSaving(true)
    setSaveError(null)
    try {
      const entries = roster.map((entry) => ({
        studentId: entry.student.id,
        status: editDraft[entry.student.id] ?? entry.status ?? 'present',
      }))
      const response = await api.patch<AdminAttendanceDayResponse>(
        `/attendance/admin/sections/${browseSectionId}/days/${browseDate}`,
        { entries },
      )
      if (!isMounted.current) return
      setDay(response)
      setIsEditing(false)
    } catch (error) {
      if (!isMounted.current) return
      setSaveError(errorMessage(error))
    } finally {
      if (isMounted.current) setSaving(false)
    }
  }

  // Reuses the section directory already fetched for "Browse & edit" (T-035) so the daily summary
  // table's "Class section" column shows the same "<Class> - <Section>" label, without a third
  // /classes + /sections fetch — the report endpoint itself only returns the bare section id/name.
  const sectionLabelById = new Map(sections.map((section) => [section.id, section.label]))

  const selectedSectionLabel = sections.find((section) => section.id === browseSectionId)?.label ?? ''

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Attendance</h1>
      <p className="mt-1 text-sm text-slate-500">
        Review any class&rsquo;s attendance, correct a locked day, and check school-wide reports.
      </p>

      {/* Browse & edit */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700">Browse attendance</h2>

        {directoryStatus === 'loading' && <p className="mt-3 text-sm text-slate-500">Loading...</p>}
        {directoryStatus === 'error' && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {directoryError}
          </p>
        )}

        {directoryStatus === 'ready' && (
          <>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="browse-section" className="block text-xs font-medium text-slate-700">
                  Class section
                </label>
                <select
                  id="browse-section"
                  value={browseSectionId}
                  onChange={(event) => setBrowseSectionId(event.target.value)}
                  disabled={saving}
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
                <label htmlFor="browse-date" className="block text-xs font-medium text-slate-700">
                  Date
                </label>
                <input
                  id="browse-date"
                  type="date"
                  value={browseDate}
                  onChange={(event) => setBrowseDate(event.target.value)}
                  disabled={saving}
                  className="mt-1.5 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              {canEdit && !isEditing && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <Pencil className="size-3.5" />
                  Edit this day
                </button>
              )}

              {canEdit && isEditing && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void saveEditing()}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="size-3.5" />
                    Save changes
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X className="size-3.5" />
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {saveError && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {saveError}
              </p>
            )}

            {dayStatus === 'loading' && <p className="mt-4 text-sm text-slate-500">Loading...</p>}
            {dayStatus === 'error' && (
              <p role="alert" className="mt-4 text-sm text-red-600">
                {dayError}
              </p>
            )}

            {dayStatus === 'ready' && day && (
              <>
                {roster.length === 0 && (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                    No students enrolled.
                  </div>
                )}

                {roster.length > 0 && !day.submitted && (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                    Not marked yet for {selectedSectionLabel} on {formatDateLabel(browseDate)}.
                  </div>
                )}

                {roster.length > 0 && day.submitted && (
                  <div className="mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Lock className="size-3.5" />
                        {day.submittedBy && day.submittedAt && (
                          <>
                            Marked by {day.submittedBy.name} &middot; {formatDateTimeLabel(day.submittedAt)}
                          </>
                        )}
                      </div>
                      {browseCounts && (
                        <div className="flex gap-2">
                          {ATTENDANCE_STATUSES.map((status) => (
                            <AttendanceStatusBadge key={status.id} status={status.id} dot>
                              {browseCounts[status.id]}
                            </AttendanceStatusBadge>
                          ))}
                        </div>
                      )}
                    </div>

                    <AttendanceList>
                      {roster.map((entry) => {
                        const currentStatus = isEditing ? editDraft[entry.student.id] : entry.status

                        return (
                          <li key={entry.student.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                            <p className="text-sm font-medium text-slate-900">{entry.student.name}</p>

                            {isEditing ? (
                              <div className="flex gap-1.5">
                                {ATTENDANCE_STATUSES.map((status) => {
                                  const active = editDraft[entry.student.id] === status.id
                                  return (
                                    <button
                                      key={status.id}
                                      type="button"
                                      onClick={() =>
                                        setEditDraft((prev) => ({ ...prev, [entry.student.id]: status.id }))
                                      }
                                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                        active ? status.activeClass : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                                      }`}
                                    >
                                      {status.label}
                                    </button>
                                  )
                                })}
                              </div>
                            ) : (
                              currentStatus && <AttendanceStatusBadge status={currentStatus} />
                            )}
                          </li>
                        )
                      })}
                    </AttendanceList>

                    {day.edits && day.edits.length > 0 && (
                      <div className="mt-4">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                          <History className="size-3.5" />
                          Edit log
                        </div>
                        <ul className="mt-2 space-y-1.5">
                          {[...day.edits].reverse().map((edit) => {
                            const student = roster.find((entry) => entry.student.id === edit.studentId)?.student
                            return (
                              <li key={`${edit.studentId}-${edit.editedAt}`} className="text-xs text-slate-500">
                                {editorNameFor(edit, user)} changed {student?.name ?? 'a student'} from{' '}
                                <span className="font-medium text-slate-700">{statusInfo(edit.fromStatus).label}</span>{' '}
                                to <span className="font-medium text-slate-700">{statusInfo(edit.toStatus).label}</span>{' '}
                                on {formatDateTimeLabel(edit.editedAt)}.
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>

      {/* Daily summary */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-violet-50 text-violet-600">
            <BarChart3 className="size-4" />
          </span>
          <h2 className="text-sm font-semibold text-slate-700">Daily summary per class</h2>
        </div>

        <div className="mt-3">
          <label htmlFor="summary-date" className="block text-xs font-medium text-slate-700">
            Date
          </label>
          <input
            id="summary-date"
            type="date"
            value={summaryDate}
            onChange={(event) => setSummaryDate(event.target.value)}
            className="mt-1.5 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Class section</th>
                <th className="px-4 py-2.5">Present</th>
                <th className="px-4 py-2.5">Absent</th>
                <th className="px-4 py-2.5">Leave</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {dailyReportStatus === 'loading' && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                    Loading...
                  </td>
                </tr>
              )}
              {dailyReportStatus === 'error' && (
                <tr>
                  <td colSpan={5} role="alert" className="px-4 py-6 text-center text-xs text-red-600">
                    {dailyReportError}
                  </td>
                </tr>
              )}
              {dailyReportStatus === 'idle' && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                    Select a date.
                  </td>
                </tr>
              )}
              {dailyReportStatus === 'ready' && dailyReport.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-slate-400">
                    No sections found.
                  </td>
                </tr>
              )}
              {dailyReportStatus === 'ready' &&
                dailyReport.map((row) => (
                  <tr key={row.section.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {sectionLabelById.get(row.section.id) ?? row.section.name}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{row.summary?.present ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.summary?.absent ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.summary?.leave ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {row.summary ? (
                        <span className="text-xs text-slate-400">Submitted</span>
                      ) : (
                        <span className="text-xs font-medium text-amber-600">Not marked yet</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Monthly percentage per student */}
      <section className="mt-10 mb-4">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-violet-50 text-violet-600">
            <BarChart3 className="size-4" />
          </span>
          <h2 className="text-sm font-semibold text-slate-700">Monthly attendance percentage per student</h2>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="monthly-section" className="block text-xs font-medium text-slate-700">
              Class section
            </label>
            <select
              id="monthly-section"
              value={monthlySectionId}
              onChange={(event) => setMonthlySectionId(event.target.value)}
              className="mt-1.5 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="monthly-month" className="block text-xs font-medium text-slate-700">
              Month
            </label>
            <input
              id="monthly-month"
              type="month"
              value={monthKey}
              onChange={(event) => setMonthKey(event.target.value)}
              className="mt-1.5 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
        </div>

        {directoryStatus === 'error' && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {directoryError}
          </p>
        )}

        <p className="mt-3 text-xs text-slate-400">{monthLabel(monthKey)}</p>

        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Student</th>
                <th className="px-4 py-2.5">Present</th>
                <th className="px-4 py-2.5">Absent</th>
                <th className="px-4 py-2.5">Leave</th>
                <th className="px-4 py-2.5">Marked days</th>
                <th className="px-4 py-2.5">Attendance %</th>
              </tr>
            </thead>
            <tbody>
              {monthlyReportStatus === 'loading' && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    Loading...
                  </td>
                </tr>
              )}
              {monthlyReportStatus === 'error' && (
                <tr>
                  <td colSpan={6} role="alert" className="px-4 py-6 text-center text-xs text-red-600">
                    {monthlyReportError}
                  </td>
                </tr>
              )}
              {monthlyReportStatus === 'idle' && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    Select a section.
                  </td>
                </tr>
              )}
              {monthlyReportStatus === 'ready' &&
                monthlyReport.map((stat) => (
                  <tr key={stat.student.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{stat.student.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{stat.present}</td>
                    <td className="px-4 py-2.5 text-slate-600">{stat.absent}</td>
                    <td className="px-4 py-2.5 text-slate-600">{stat.leave}</td>
                    <td className="px-4 py-2.5 text-slate-600">{stat.markedDays}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">
                      {formatAttendancePercentage(stat.percentage)}
                    </td>
                  </tr>
                ))}
              {monthlyReportStatus === 'ready' && monthlyReport.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-xs text-slate-400">
                    No students enrolled.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  )
}
