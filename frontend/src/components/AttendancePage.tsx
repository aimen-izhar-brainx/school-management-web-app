import { BarChart3, History, Lock, Pencil, Save, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  ATTENDANCE_STATUSES,
  currentMonthKey,
  formatDateLabel,
  formatDateTimeLabel,
  monthLabel,
  mostRecentSchoolDay,
  statusInfo,
  type AttendanceStatus,
} from '../data/attendance'
import type { AuthUser } from '../lib/auth'
import * as attendanceApi from '../lib/attendance'
import {
  sectionLabel,
  type AttendanceAuditEntry,
  type AttendanceSession,
  type DailySectionSummary,
  type MonthlyStudentRow,
} from '../lib/attendance'
import { AttendanceList } from './AttendanceList'
import { AttendanceStatusBadge } from './AttendanceStatusBadge'
import { formatAttendancePercentage } from './attendancePercentage'
import { DashboardShell } from './DashboardShell'
import { useAttendanceSections } from './useAttendanceSections'
import { useSectionRoster } from './useSectionRoster'

interface AttendancePageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback
}

/** Admin-only screen: browse & correct any class's attendance, plus basic daily/monthly reports. */
export function AttendancePage({ onBack, onSignOut }: AttendancePageProps) {
  const { sections, loading: sectionsLoading, error: sectionsError } = useAttendanceSections()

  const [chosenBrowseId, setChosenBrowseId] = useState('')
  const [browseDate, setBrowseDate] = useState(mostRecentSchoolDay())
  const [session, setSession] = useState<AttendanceSession | null>(null)
  const [auditLog, setAuditLog] = useState<AttendanceAuditEntry[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [editStatus, setEditStatus] = useState<AttendanceStatus | null>(null)
  const [editReason, setEditReason] = useState('')
  const [saving, setSaving] = useState(false)

  const [summaryDate, setSummaryDate] = useState(mostRecentSchoolDay())
  const [dailyRows, setDailyRows] = useState<DailySectionSummary[]>([])
  const [dailyError, setDailyError] = useState<string | null>(null)

  const [chosenMonthlyId, setChosenMonthlyId] = useState('')
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStudentRow[]>([])
  const [monthlyError, setMonthlyError] = useState<string | null>(null)

  const browseSection = sections.find((section) => section.id === chosenBrowseId) ?? sections[0] ?? null
  const browseSectionId = browseSection?.id ?? ''
  const { roster: browseRoster, error: rosterError } = useSectionRoster(browseSectionId)
  const monthlySectionId = (sections.find((section) => section.id === chosenMonthlyId) ?? sections[0])?.id ?? ''

  // Loading a different day abandons any edit in progress, which avoids silently editing the wrong day.
  useEffect(() => {
    if (!browseSectionId) return
    let active = true
    setBrowseLoading(true)
    setBrowseError(null)
    setEditingStudentId(null)
    Promise.all([
      attendanceApi.getSectionDay(browseSectionId, browseDate),
      attendanceApi.getAuditForDay(browseSectionId, browseDate),
    ])
      .then(([day, audit]) => {
        if (!active) return
        setSession(day)
        setAuditLog(day ? audit : [])
      })
      .catch((cause: unknown) => {
        if (!active) return
        setSession(null)
        setAuditLog([])
        setBrowseError(errorMessage(cause, 'Could not load attendance.'))
      })
      .finally(() => {
        if (active) setBrowseLoading(false)
      })
    return () => {
      active = false
    }
  }, [browseSectionId, browseDate, reloadCount])

  useEffect(() => {
    let active = true
    setDailyError(null)
    attendanceApi
      .getDailySummary(summaryDate)
      .then((rows) => {
        if (active) setDailyRows(rows)
      })
      .catch((cause: unknown) => {
        if (active) setDailyError(errorMessage(cause, 'Could not load the summary.'))
      })
    return () => {
      active = false
    }
  }, [summaryDate, reloadCount])

  useEffect(() => {
    if (!monthlySectionId) return
    let active = true
    setMonthlyError(null)
    attendanceApi
      .getMonthlyForSection(monthlySectionId, monthKey)
      .then((rows) => {
        if (active) setMonthlyStats(rows)
      })
      .catch((cause: unknown) => {
        if (active) setMonthlyError(errorMessage(cause, 'Could not load the monthly report.'))
      })
    return () => {
      active = false
    }
  }, [monthlySectionId, monthKey, reloadCount])

  const statusByStudent = new Map(session?.records.map((record) => [record.studentId, record.status]))
  const counts = { present: 0, absent: 0, leave: 0 }
  for (const record of session?.records ?? []) counts[record.status] += 1

  const startEditing = (studentId: string, status: AttendanceStatus) => {
    setEditingStudentId(studentId)
    setEditStatus(status)
    setEditReason('')
    setBrowseError(null)
  }

  const cancelEditing = () => {
    setEditingStudentId(null)
    setEditStatus(null)
  }

  const saveEditing = async () => {
    const record = session?.records.find((candidate) => candidate.studentId === editingStudentId)
    if (!record || !editStatus) return
    if (editStatus === record.status) {
      cancelEditing()
      return
    }
    if (!editReason.trim()) {
      setBrowseError('Please give a reason for the correction.')
      return
    }

    setSaving(true)
    setBrowseError(null)
    try {
      await attendanceApi.correctRecord(record.id, editStatus, editReason.trim())
      cancelEditing()
    } catch (cause) {
      setBrowseError(errorMessage(cause, 'Could not save the correction.'))
    } finally {
      setSaving(false)
      setReloadCount((count) => count + 1)
    }
  }

  const sectionOptions = sections.map((section) => (
    <option key={section.id} value={section.id}>
      {sectionLabel(section)}
    </option>
  ))

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Attendance</h1>
      <p className="mt-1 text-sm text-slate-500">
        Review any class&rsquo;s attendance, correct a locked day, and check school-wide reports.
      </p>

      {(sectionsError || rosterError) && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {sectionsError ?? rosterError}
        </p>
      )}
      {sectionsLoading && <p className="mt-4 text-sm text-slate-500">Loading&hellip;</p>}

      {/* Browse & edit */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700">Browse attendance</h2>

        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="browse-section" className="block text-xs font-medium text-slate-700">
              Class section
            </label>
            <select
              id="browse-section"
              value={browseSectionId}
              onChange={(event) => setChosenBrowseId(event.target.value)}
              className="mt-1.5 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              {sectionOptions}
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
              className="mt-1.5 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
        </div>

        {browseError && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {browseError}
          </p>
        )}
        {browseLoading && <p className="mt-4 text-sm text-slate-500">Loading&hellip;</p>}

        {!session && !browseLoading && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Not marked yet for {browseSection ? sectionLabel(browseSection) : 'this class'} on {formatDateLabel(browseDate)}.
          </div>
        )}

        {session && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Lock className="size-3.5" />
                Marked by {session.submittedBy.name} &middot; {formatDateTimeLabel(session.submittedAt)}
              </div>
              <div className="flex gap-2">
                {ATTENDANCE_STATUSES.map((status) => (
                  <AttendanceStatusBadge key={status.id} status={status.id} dot>
                    {counts[status.id]}
                  </AttendanceStatusBadge>
                ))}
              </div>
            </div>

            <AttendanceList>
              {browseRoster.map((student) => {
                const currentStatus = statusByStudent.get(student.id)
                const editing = editingStudentId === student.id

                return (
                  <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{student.name}</p>
                      <p className="text-xs text-slate-400">Roll no. {student.rollNumber}</p>
                    </div>

                    {editing ? (
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex gap-1.5">
                          {ATTENDANCE_STATUSES.map((status) => (
                            <button
                              key={status.id}
                              type="button"
                              onClick={() => setEditStatus(status.id)}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                editStatus === status.id
                                  ? status.activeClass
                                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                              }`}
                            >
                              {status.label}
                            </button>
                          ))}
                        </div>
                        <label htmlFor="edit-reason" className="sr-only">
                          Reason for correction
                        </label>
                        <input
                          id="edit-reason"
                          type="text"
                          placeholder="Reason for correction"
                          value={editReason}
                          onChange={(event) => setEditReason(event.target.value)}
                          className="block w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={saveEditing}
                            disabled={saving}
                            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700"
                          >
                            <Save className="size-3.5" />
                            {saving ? 'Saving…' : 'Save changes'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                          >
                            <X className="size-3.5" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        {currentStatus && <AttendanceStatusBadge status={currentStatus} />}
                        {currentStatus && (
                          <button
                            type="button"
                            aria-label={`Edit ${student.name}`}
                            onClick={() => startEditing(student.id, currentStatus)}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </AttendanceList>

            {auditLog.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <History className="size-3.5" />
                  Edit log
                </div>
                <ul className="mt-2 space-y-1.5">
                  {auditLog.map((edit) => {
                    const student = browseRoster.find((candidate) => candidate.id === edit.record.studentId)
                    return (
                      <li key={edit.id} className="text-xs text-slate-500">
                        {edit.changedBy.name} changed {student?.name ?? 'a student'} from{' '}
                        <span className="font-medium text-slate-700">{statusInfo(edit.oldStatus).label}</span> to{' '}
                        <span className="font-medium text-slate-700">{statusInfo(edit.newStatus).label}</span> on{' '}
                        {formatDateTimeLabel(edit.createdAt)} &mdash; {edit.reason}.
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
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

        {dailyError && <p role="alert" className="mt-4 text-sm text-red-700">{dailyError}</p>}

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
              {dailyRows.map((row) => (
                <tr key={row.sectionId} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{sectionLabel(row)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{row.marked ? row.present : '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{row.marked ? row.absent : '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{row.marked ? row.leave : '—'}</td>
                  <td className="px-4 py-2.5">
                    {row.marked ? (
                      <span className="text-xs text-slate-400">{row.enrolled} enrolled</span>
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
              onChange={(event) => setChosenMonthlyId(event.target.value)}
              className="mt-1.5 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              {sectionOptions}
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

        {monthlyError && <p role="alert" className="mt-3 text-sm text-red-700">{monthlyError}</p>}
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
              {monthlyStats.map((stat) => (
                <tr key={stat.studentId} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{stat.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{stat.present}</td>
                  <td className="px-4 py-2.5 text-slate-600">{stat.absent}</td>
                  <td className="px-4 py-2.5 text-slate-600">{stat.leave}</td>
                  <td className="px-4 py-2.5 text-slate-600">{stat.total}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">
                    {formatAttendancePercentage(stat.percentage)}
                  </td>
                </tr>
              ))}
              {monthlyStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-xs text-slate-400">
                    No students enrolled in this section.
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
