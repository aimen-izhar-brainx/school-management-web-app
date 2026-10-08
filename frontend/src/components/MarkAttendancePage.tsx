import { CircleCheck, Lock } from 'lucide-react'
import { useState } from 'react'
import {
  ATTENDANCE_STATUSES,
  INITIAL_ATTENDANCE_RECORDS,
  attendanceKey,
  formatDateLabel,
  formatDateTimeLabel,
  getTodayKey,
  rosterFor,
  statusInfo,
  summarizeEntries,
  type AttendanceRecord,
  type AttendanceStatus,
} from '../data/attendance'
import { SECTION_OPTIONS, sectionLabel } from '../data/timetable'
import type { AuthUser } from '../lib/auth'
import { DashboardShell } from './DashboardShell'

interface MarkAttendancePageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

function defaultDraft(sectionId: string): Record<string, AttendanceStatus> {
  const draft: Record<string, AttendanceStatus> = {}
  for (const student of rosterFor(sectionId)) draft[student.id] = 'present'
  return draft
}

/** Teacher-only screen for marking daily attendance. Submitting locks the day — only an admin can edit it afterwards. */
export function MarkAttendancePage({ user, onBack, onSignOut }: MarkAttendancePageProps) {
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>(INITIAL_ATTENDANCE_RECORDS)
  const [sectionId, setSectionId] = useState(SECTION_OPTIONS[0]?.id ?? '')
  const [date, setDate] = useState(getTodayKey())
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>(() => defaultDraft(sectionId))

  const roster = rosterFor(sectionId)
  const selectedSection = SECTION_OPTIONS.find((section) => section.id === sectionId) ?? SECTION_OPTIONS[0]
  const key = attendanceKey(sectionId, date)
  const existing = records[key] ?? null
  const today = getTodayKey()

  // Reset the in-progress draft whenever the class or date changes — an unsubmitted draft isn't kept around.
  const [draftKey, setDraftKey] = useState(key)
  if (draftKey !== key) {
    setDraftKey(key)
    setDraft(defaultDraft(sectionId))
  }

  const setStudentStatus = (studentId: string, status: AttendanceStatus) => {
    setDraft((prev) => ({ ...prev, [studentId]: status }))
  }

  const markAllPresent = () => setDraft(defaultDraft(sectionId))

  const handleSubmit = () => {
    const record: AttendanceRecord = {
      sectionId,
      date,
      entries: draft,
      submittedBy: user.name,
      submittedAt: new Date().toISOString(),
      locked: true,
      editLog: [],
    }
    setRecords((prev) => ({ ...prev, [key]: record }))
  }

  const summary = existing ? summarizeEntries(existing.entries) : null

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
            onChange={(event) => setSectionId(event.target.value)}
            className="mt-1.5 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            {SECTION_OPTIONS.map((section) => (
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

      {roster.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No students are enrolled in this section yet.
        </div>
      )}

      {roster.length > 0 && existing && (
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Lock className="size-4 text-slate-400" />
              Submitted &amp; locked
            </div>
            <p className="text-xs text-slate-500">
              Marked by {existing.submittedBy} &middot; {formatDateTimeLabel(existing.submittedAt)}
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
              const status = existing.entries[student.id]
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

      {roster.length > 0 && !existing && (
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
            className="mt-4 flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
          >
            <CircleCheck className="size-4" />
            Submit attendance
          </button>
        </div>
      )}
    </DashboardShell>
  )
}
