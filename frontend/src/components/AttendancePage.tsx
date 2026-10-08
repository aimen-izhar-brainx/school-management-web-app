import { BarChart3, History, Lock, Pencil, Save, X } from 'lucide-react'
import { useState } from 'react'
import {
  ATTENDANCE_STATUSES,
  INITIAL_ATTENDANCE_RECORDS,
  attendanceKey,
  currentMonthKey,
  formatDateLabel,
  formatDateTimeLabel,
  monthLabel,
  monthlyStatsForSection,
  mostRecentSchoolDay,
  rosterFor,
  statusInfo,
  summarizeEntries,
  type AttendanceEdit,
  type AttendanceRecord,
  type AttendanceStatus,
} from '../data/attendance'
import { SECTION_OPTIONS, sectionLabel } from '../data/timetable'
import type { AuthUser } from '../lib/auth'
import { DashboardShell } from './DashboardShell'

interface AttendancePageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

/** Admin-only screen: browse & correct any class's attendance, plus basic daily/monthly reports. UI only — nothing is persisted yet. */
export function AttendancePage({ user, onBack, onSignOut }: AttendancePageProps) {
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>(INITIAL_ATTENDANCE_RECORDS)

  const [browseSectionId, setBrowseSectionId] = useState(SECTION_OPTIONS[0]?.id ?? '')
  const [browseDate, setBrowseDate] = useState(mostRecentSchoolDay())
  const [isEditing, setIsEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<Record<string, AttendanceStatus>>({})

  const [summaryDate, setSummaryDate] = useState(mostRecentSchoolDay())

  const [monthlySectionId, setMonthlySectionId] = useState(SECTION_OPTIONS[0]?.id ?? '')
  const [monthKey, setMonthKey] = useState(currentMonthKey())

  const browseKey = attendanceKey(browseSectionId, browseDate)
  const browseRecord = records[browseKey] ?? null
  const browseRoster = rosterFor(browseSectionId)

  // Leaving edit mode when the filters change avoids silently editing the wrong day.
  const [editedKey, setEditedKey] = useState(browseKey)
  if (editedKey !== browseKey) {
    setEditedKey(browseKey)
    if (isEditing) setIsEditing(false)
  }

  const startEditing = () => {
    if (!browseRecord) return
    setEditDraft({ ...browseRecord.entries })
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditDraft({})
  }

  const saveEditing = () => {
    if (!browseRecord) return
    const editedAt = new Date().toISOString()
    const newEdits: AttendanceEdit[] = []

    for (const student of browseRoster) {
      const from = browseRecord.entries[student.id]
      const to = editDraft[student.id]
      if (from && to && from !== to) {
        newEdits.push({ studentId: student.id, from, to, editedBy: user.name, editedAt })
      }
    }

    if (newEdits.length > 0) {
      setRecords((prev) => ({
        ...prev,
        [browseKey]: {
          ...browseRecord,
          entries: editDraft,
          editLog: [...browseRecord.editLog, ...newEdits],
        },
      }))
    }

    setIsEditing(false)
  }

  const dailySummaryRows = SECTION_OPTIONS.map((section) => {
    const record = records[attendanceKey(section.id, summaryDate)] ?? null
    const roster = rosterFor(section.id)
    const counts = record ? summarizeEntries(record.entries) : null
    return { section, roster, counts }
  })

  const monthlyStats = monthlyStatsForSection(records, monthlySectionId, monthKey)

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Attendance</h1>
      <p className="mt-1 text-sm text-slate-500">
        Review any class&rsquo;s attendance, correct a locked day, and check school-wide reports.
      </p>

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
              onChange={(event) => setBrowseSectionId(event.target.value)}
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

          {browseRecord && !isEditing && (
            <button
              type="button"
              onClick={startEditing}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <Pencil className="size-3.5" />
              Edit this day
            </button>
          )}

          {browseRecord && isEditing && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveEditing}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
              >
                <Save className="size-3.5" />
                Save changes
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <X className="size-3.5" />
                Cancel
              </button>
            </div>
          )}
        </div>

        {!browseRecord && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Not marked yet for {sectionLabel(SECTION_OPTIONS.find((s) => s.id === browseSectionId) ?? SECTION_OPTIONS[0])} on {formatDateLabel(browseDate)}.
          </div>
        )}

        {browseRecord && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Lock className="size-3.5" />
                Marked by {browseRecord.submittedBy} &middot; {formatDateTimeLabel(browseRecord.submittedAt)}
              </div>
              <div className="flex gap-2">
                {ATTENDANCE_STATUSES.map((status) => (
                  <span
                    key={status.id}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.badgeClass}`}
                  >
                    <span className={`size-1.5 rounded-full ${status.dotClass}`} />
                    {summarizeEntries(browseRecord.entries)[status.id]}
                  </span>
                ))}
              </div>
            </div>

            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {browseRoster.map((student) => {
                const currentStatus = isEditing ? editDraft[student.id] : browseRecord.entries[student.id]
                const info = currentStatus ? statusInfo(currentStatus) : null

                return (
                  <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{student.name}</p>
                      <p className="text-xs text-slate-400">Roll no. {student.rollNumber}</p>
                    </div>

                    {isEditing ? (
                      <div className="flex gap-1.5">
                        {ATTENDANCE_STATUSES.map((status) => {
                          const active = editDraft[student.id] === status.id
                          return (
                            <button
                              key={status.id}
                              type="button"
                              onClick={() => setEditDraft((prev) => ({ ...prev, [student.id]: status.id }))}
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
                      info && (
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${info.badgeClass}`}>
                          {info.label}
                        </span>
                      )
                    )}
                  </li>
                )
              })}
            </ul>

            {browseRecord.editLog.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <History className="size-3.5" />
                  Edit log
                </div>
                <ul className="mt-2 space-y-1.5">
                  {[...browseRecord.editLog].reverse().map((edit, index) => {
                    const student = browseRoster.find((candidate) => candidate.id === edit.studentId)
                    return (
                      <li key={index} className="text-xs text-slate-500">
                        {edit.editedBy} changed {student?.name ?? 'a student'} from{' '}
                        <span className="font-medium text-slate-700">{statusInfo(edit.from).label}</span> to{' '}
                        <span className="font-medium text-slate-700">{statusInfo(edit.to).label}</span> on{' '}
                        {formatDateTimeLabel(edit.editedAt)}.
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
              {dailySummaryRows.map(({ section, roster, counts }) => (
                <tr key={section.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{sectionLabel(section)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{counts?.present ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{counts?.absent ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{counts?.leave ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {counts ? (
                      <span className="text-xs text-slate-400">{roster.length} enrolled</span>
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
              {SECTION_OPTIONS.map((section) => (
                <option key={section.id} value={section.id}>
                  {sectionLabel(section)}
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
                <tr key={stat.student.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{stat.student.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{stat.present}</td>
                  <td className="px-4 py-2.5 text-slate-600">{stat.absent}</td>
                  <td className="px-4 py-2.5 text-slate-600">{stat.leave}</td>
                  <td className="px-4 py-2.5 text-slate-600">{stat.markedDays}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">
                    {stat.percentage === null ? '—' : `${stat.percentage}%`}
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
