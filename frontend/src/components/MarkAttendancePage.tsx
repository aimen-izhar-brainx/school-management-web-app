import { CircleCheck, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  ATTENDANCE_STATUSES,
  formatDateLabel,
  formatDateTimeLabel,
  getTodayKey,
  statusInfo,
  type AttendanceStatus,
} from '../data/attendance'
import type { AuthUser } from '../lib/auth'
import * as attendanceApi from '../lib/attendance'
import { sectionLabel, type AttendanceSession, type AttendanceStudent } from '../lib/attendance'
import { DashboardShell } from './DashboardShell'
import { useAttendanceSections } from './useAttendanceSections'
import { useSectionRoster } from './useSectionRoster'

interface MarkAttendancePageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

function defaultDraft(roster: AttendanceStudent[]): Record<string, AttendanceStatus> {
  const draft: Record<string, AttendanceStatus> = {}
  for (const student of roster) draft[student.id] = 'present'
  return draft
}

function summarize(session: AttendanceSession): Record<AttendanceStatus, number> {
  const summary: Record<AttendanceStatus, number> = { present: 0, absent: 0, leave: 0 }
  for (const record of session.records) summary[record.status] += 1
  return summary
}

/** Teacher-only screen for marking daily attendance. Submitting locks the day — only an admin can edit it afterwards. */
export function MarkAttendancePage({ onBack, onSignOut }: MarkAttendancePageProps) {
  const { sections, loading: sectionsLoading, error: sectionsError } = useAttendanceSections()
  const [chosenSectionId, setChosenSectionId] = useState('')
  const [date, setDate] = useState(getTodayKey())
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({})
  const [existing, setExisting] = useState<AttendanceSession | null>(null)
  const [dayLoading, setDayLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const selectedSection = sections.find((section) => section.id === chosenSectionId) ?? sections[0] ?? null
  const sectionId = selectedSection?.id ?? ''
  const { roster, loading: rosterLoading, error: rosterError } = useSectionRoster(sectionId)
  const today = getTodayKey()

  // Reset the in-progress draft and look up any submitted record whenever the class or date changes —
  // an unsubmitted draft isn't kept around.
  useEffect(() => {
    if (!sectionId) return
    let active = true
    setDayLoading(true)
    setError(null)
    setExisting(null)
    attendanceApi
      .getSectionDay(sectionId, date)
      .then((session) => {
        if (active) setExisting(session)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load attendance.')
      })
      .finally(() => {
        if (active) setDayLoading(false)
      })
    return () => {
      active = false
    }
  }, [sectionId, date])

  useEffect(() => {
    setDraft(defaultDraft(roster))
  }, [roster, date])

  const setStudentStatus = (studentId: string, status: AttendanceStatus) => {
    setDraft((prev) => ({ ...prev, [studentId]: status }))
  }

  const markAllPresent = () => setDraft(defaultDraft(roster))

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      setExisting(await attendanceApi.submitAttendance(sectionId, date, draft))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit attendance.')
    } finally {
      setSubmitting(false)
    }
  }

  const summary = existing ? summarize(existing) : null
  const statusById = new Map(existing?.records.map((record) => [record.studentId, record.status]))

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Mark attendance</h1>
      <p className="mt-1 text-sm text-slate-500">Mark Present, Absent or Leave for each student, per class, per day.</p>

      <div className="mt-8 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="attendance-section" className="block text-xs font-medium text-slate-700">
            Class section
          </label>
          <select
            id="attendance-section"
            value={sectionId}
            onChange={(event) => setChosenSectionId(event.target.value)}
            className="mt-1.5 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {sectionLabel(section)}
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
            className="mt-1.5 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
      </div>

      {(sectionsError || rosterError || error) && (
        <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {sectionsError ?? rosterError ?? error}
        </p>
      )}

      {(sectionsLoading || rosterLoading || dayLoading) && <p className="mt-8 text-sm text-slate-500">Loading&hellip;</p>}

      {!sectionsLoading && !rosterLoading && !dayLoading && roster.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No students are enrolled in this section yet.
        </div>
      )}

      {!dayLoading && roster.length > 0 && existing && (
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Lock className="size-4 text-slate-400" />
              Submitted &amp; locked
            </div>
            <p className="text-xs text-slate-500">
              Marked by {existing.submittedBy.name} &middot; {formatDateTimeLabel(existing.submittedAt)}
            </p>
          </div>

          <div className="mt-3 flex gap-2">
            {ATTENDANCE_STATUSES.map((status) => (
              <span
                key={status.id}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${status.badgeClass}`}
              >
                <span className={`size-1.5 rounded-full ${status.dotClass}`} />
                {status.label} &middot; {summary?.[status.id] ?? 0}
              </span>
            ))}
          </div>

          <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {roster.map((student) => {
              const status = statusById.get(student.id)
              const info = status ? statusInfo(status) : null
              return (
                <li key={student.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-slate-900">{student.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">Roll no. {student.rollNumber}</span>
                    {info && (
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${info.badgeClass}`}>
                        {info.label}
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>

          <p className="mt-3 text-xs text-slate-400">
            This day is locked. Contact an admin if a correction is needed — edits are logged.
          </p>
        </div>
      )}

      {!dayLoading && roster.length > 0 && !existing && (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              {selectedSection ? sectionLabel(selectedSection) : 'Class'} &middot; {formatDateLabel(date)}
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
            {roster.map((student) => (
              <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{student.name}</p>
                  <p className="text-xs text-slate-400">Roll no. {student.rollNumber}</p>
                </div>
                <div className="flex gap-1.5">
                  {ATTENDANCE_STATUSES.map((status) => {
                    const active = draft[student.id] === status.id
                    return (
                      <button
                        key={status.id}
                        type="button"
                        onClick={() => setStudentStatus(student.id, status.id)}
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

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-4 flex items-center gap-1.5 rounded-lg bg-violet-600 disabled:opacity-60 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
          >
            <CircleCheck className="size-4" />
            {submitting ? 'Submitting…' : 'Submit attendance'}
          </button>
        </div>
      )}
    </DashboardShell>
  )
}
