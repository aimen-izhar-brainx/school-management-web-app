import { Coffee, Plus, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import {
  DAYS,
  DEFAULT_PERIODS,
  INITIAL_TIMETABLES,
  SECTION_OPTIONS,
  SUBJECTS,
  TEACHERS,
  sectionLabel,
  type DayId,
  type Period,
  type TimetableGrid,
} from '../data/timetable'
import type { AuthUser } from '../lib/auth'
import { DashboardShell } from './DashboardShell'

interface TimetablePageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

let periodIdCounter = 100
function makePeriodId(): string {
  periodIdCounter += 1
  return `p-${periodIdCounter}`
}

function formatTime(time: string): string {
  const [hourString, minute] = time.split(':')
  const hour = Number(hourString)
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${minute} ${period}`
}

/** Admin-only screen for building each section's weekly timetable. UI only — nothing is persisted yet. */
export function TimetablePage({ user, onBack, onSignOut }: TimetablePageProps) {
  const [periods, setPeriods] = useState<Period[]>(DEFAULT_PERIODS)
  const [timetables, setTimetables] = useState<Record<string, TimetableGrid>>(INITIAL_TIMETABLES)
  const [selectedSectionId, setSelectedSectionId] = useState(SECTION_OPTIONS[0]?.id ?? '')

  const [newStartTime, setNewStartTime] = useState('')
  const [newEndTime, setNewEndTime] = useState('')
  const [newIsBreak, setNewIsBreak] = useState(false)
  const [newBreakLabel, setNewBreakLabel] = useState('')
  const [periodError, setPeriodError] = useState<string | null>(null)

  const selectedSection = SECTION_OPTIONS.find((section) => section.id === selectedSectionId) ?? null
  const grid = (selectedSectionId ? timetables[selectedSectionId] : undefined) ?? {}

  const setCell = (periodId: string, day: DayId, field: 'subject' | 'teacherId', value: string) => {
    if (!selectedSectionId) return
    setTimetables((prev) => {
      const sectionGrid = prev[selectedSectionId] ?? {}
      const periodRow = sectionGrid[periodId] ?? {}
      const existing = periodRow[day]

      let nextEntry: { subject: string; teacherId: string } | undefined

      if (field === 'subject') {
        nextEntry = value ? { subject: value, teacherId: existing?.teacherId ?? '' } : undefined
      } else {
        nextEntry = existing?.subject ? { subject: existing.subject, teacherId: value } : existing
      }

      return {
        ...prev,
        [selectedSectionId]: {
          ...sectionGrid,
          [periodId]: { ...periodRow, [day]: nextEntry },
        },
      }
    })
  }

  const clearCell = (periodId: string, day: DayId) => {
    if (!selectedSectionId) return
    setTimetables((prev) => {
      const sectionGrid = prev[selectedSectionId] ?? {}
      const periodRow = { ...(sectionGrid[periodId] ?? {}) }
      delete periodRow[day]
      return { ...prev, [selectedSectionId]: { ...sectionGrid, [periodId]: periodRow } }
    })
  }

  const handleAddPeriod = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPeriodError(null)

    if (!newStartTime || !newEndTime) {
      setPeriodError('Please set both a start and end time.')
      return
    }
    if (newEndTime <= newStartTime) {
      setPeriodError('End time must be after the start time.')
      return
    }

    const created: Period = {
      id: makePeriodId(),
      startTime: newStartTime,
      endTime: newEndTime,
      isBreak: newIsBreak,
      breakLabel: newIsBreak ? newBreakLabel.trim() || 'Break' : undefined,
    }
    setPeriods((prev) => [...prev, created])
    setNewStartTime('')
    setNewEndTime('')
    setNewIsBreak(false)
    setNewBreakLabel('')
  }

  const handleRemovePeriod = (periodId: string) => {
    setPeriods((prev) => prev.filter((period) => period.id !== periodId))
  }

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-6xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Timetable</h1>
      <p className="mt-1 text-sm text-slate-500">
        Build the weekly timetable for each class section at {user.name.split(' ')[0]}&rsquo;s school.
      </p>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        <aside className="shrink-0 lg:w-56">
          <h2 className="text-sm font-semibold text-slate-700">Class sections</h2>
          <ul className="mt-3 space-y-1.5">
            {SECTION_OPTIONS.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => setSelectedSectionId(section.id)}
                  className={`flex w-full items-center rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                    selectedSectionId === section.id
                      ? 'border-violet-200 bg-violet-50 text-violet-700'
                      : 'border-transparent text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {sectionLabel(section)}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0 flex-1 space-y-8">
          {!selectedSection && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Select a class section to build its timetable.
            </div>
          )}

          {selectedSection && (
            <section>
              <h2 className="text-xl font-bold text-slate-900">{sectionLabel(selectedSection)}</h2>
              <p className="mt-1 text-sm text-slate-500">
                Pick a subject and teacher for each day &amp; period below.
              </p>

              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="w-28 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Time
                      </th>
                      {DAYS.map((day) => (
                        <th
                          key={day.id}
                          className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
                        >
                          {day.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((period) => {
                      if (period.isBreak) {
                        return (
                          <tr key={period.id} className="border-b border-slate-200 bg-amber-50/60">
                            <td colSpan={DAYS.length + 1} className="px-3 py-2">
                              <div className="flex items-center gap-2 text-xs font-medium text-amber-700">
                                <Coffee className="size-3.5" />
                                {period.breakLabel ?? 'Break'} &middot; {formatTime(period.startTime)} &ndash;{' '}
                                {formatTime(period.endTime)}
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      const periodRow = grid[period.id] ?? {}

                      return (
                        <tr key={period.id} className="border-b border-slate-100 align-top last:border-b-0">
                          <td className="px-3 py-2.5 text-xs font-medium text-slate-500">
                            {formatTime(period.startTime)}
                            <br />
                            {formatTime(period.endTime)}
                          </td>
                          {DAYS.map((day) => {
                            const entry = periodRow[day.id]
                            return (
                              <td key={day.id} className="px-2 py-2 align-top">
                                <div className="relative space-y-1.5 rounded-lg border border-slate-200 bg-white p-2">
                                  {entry?.subject && (
                                    <button
                                      type="button"
                                      onClick={() => clearCell(period.id, day.id)}
                                      className="absolute right-1 top-1 text-slate-300 transition-colors hover:text-red-600"
                                      aria-label="Clear this slot"
                                    >
                                      <X className="size-3.5" />
                                    </button>
                                  )}
                                  <select
                                    value={entry?.subject ?? ''}
                                    onChange={(event) => setCell(period.id, day.id, 'subject', event.target.value)}
                                    className="block w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 pr-5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                  >
                                    <option value="">Free period</option>
                                    {SUBJECTS.map((subject) => (
                                      <option key={subject} value={subject}>
                                        {subject}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={entry?.teacherId ?? ''}
                                    onChange={(event) => setCell(period.id, day.id, 'teacherId', event.target.value)}
                                    disabled={!entry?.subject}
                                    className="block w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                                  >
                                    <option value="">Unassigned</option>
                                    {TEACHERS.map((teacher) => (
                                      <option key={teacher.id} value={teacher.id}>
                                        {teacher.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <h2 className="text-sm font-semibold text-slate-700">Manage periods</h2>
            <p className="mt-1 text-xs text-slate-500">
              Periods and breaks apply to every class section&rsquo;s timetable.
            </p>

            <ul className="mt-3 space-y-1.5">
              {periods.map((period) => (
                <li
                  key={period.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm"
                >
                  <span className="flex items-center gap-2 text-slate-700">
                    {period.isBreak && <Coffee className="size-3.5 text-amber-600" />}
                    {formatTime(period.startTime)} &ndash; {formatTime(period.endTime)}
                    {period.isBreak && (
                      <span className="text-xs text-slate-400">({period.breakLabel ?? 'Break'})</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemovePeriod(period.id)}
                    className="text-slate-400 transition-colors hover:text-red-600"
                    aria-label="Remove period"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
              {periods.length === 0 && <li className="text-xs text-slate-400">No periods defined yet.</li>}
            </ul>

            <form onSubmit={handleAddPeriod} className="mt-4 max-w-md space-y-3" noValidate>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label htmlFor="period-start" className="block text-xs font-medium text-slate-700">
                    Start time
                  </label>
                  <input
                    id="period-start"
                    type="time"
                    value={newStartTime}
                    onChange={(event) => setNewStartTime(event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="period-end" className="block text-xs font-medium text-slate-700">
                    End time
                  </label>
                  <input
                    id="period-end"
                    type="time"
                    value={newEndTime}
                    onChange={(event) => setNewEndTime(event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={newIsBreak}
                  onChange={(event) => setNewIsBreak(event.target.checked)}
                  className="size-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-600"
                />
                This is a break, not a teaching period
              </label>

              {newIsBreak && (
                <input
                  value={newBreakLabel}
                  onChange={(event) => setNewBreakLabel(event.target.value)}
                  placeholder="e.g. Recess"
                  className="block w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              )}

              {periodError && (
                <p role="alert" className="text-xs text-red-600">
                  {periodError}
                </p>
              )}

              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Plus className="size-4" />
                Add period
              </button>
            </form>
          </section>
        </div>
      </div>
    </DashboardShell>
  )
}
