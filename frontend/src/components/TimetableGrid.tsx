import { X } from 'lucide-react'
import { DAYS, formatTime } from '../data/timetable'
import { cellKey } from '../lib/timetable'
import type { ClassSubject, DayId, Subject, TimetablePeriod } from '../lib/types'
import { TimetableBreakRow } from './TimetableBreakRow'

interface SharedProps<E extends { subject: Subject }> {
  periods: TimetablePeriod[]
  /** Entries of the shown section, keyed by `cellKey`. */
  entries: Record<string, E>
  /** Text under each cell's subject (e.g. its teacher). */
  caption?: (entry: E) => string
  /** Read-only text of a cell's subject line; defaults to the subject name. */
  label?: (entry: E) => string
  cellErrors?: Record<string, string>
}

interface EditableProps {
  editable: true
  /** The class's subjects: the options of each cell's selector. */
  subjects: ClassSubject[]
  busyKeys: string[]
  onAssign: (periodId: string, day: DayId, subjectId: string) => void
  onClear: (periodId: string, day: DayId) => void
}

interface ReadOnlyProps {
  editable: false
}

type TimetableGridProps<E extends { subject: Subject }> = SharedProps<E> & (EditableProps | ReadOnlyProps)

/** Weekly grid (periods by weekday) of one section's timetable. */
export function TimetableGrid<E extends { subject: Subject }>(props: TimetableGridProps<E>) {
  const { periods, entries, caption, label = (entry) => entry.subject.name, cellErrors = {} } = props
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th scope="col" className="w-28 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Time</th>
            {DAYS.map((day) => (
              <th key={day.id} scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {day.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => {
            if (period.isBreak) {
              return (
                <TimetableBreakRow
                  key={period.id}
                  label={period.label}
                  startTime={period.startTime}
                  endTime={period.endTime}
                />
              )
            }

            return (
              <tr key={period.id} className="border-b border-slate-100 align-top last:border-b-0">
                <th scope="row" className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">
                  <span className="block text-slate-700">{period.label}</span>
                  {formatTime(period.startTime)}
                  <br />
                  {formatTime(period.endTime)}
                </th>
                {DAYS.map((day) => {
                  const key = cellKey(period.id, day.id)
                  const entry = entries[key]
                  const name = `${period.label} ${day.label}`
                  const isBusy = props.editable && props.busyKeys.includes(key)
                  const error = cellErrors[key]
                  const errorId = `cell-error-${key}`

                  return (
                    <td key={day.id} className="px-2 py-2 align-top">
                      <div className="relative space-y-1.5 rounded-lg border border-slate-200 bg-white p-2">
                        {props.editable ? (
                          <>
                            {entry && (
                              <button
                                type="button"
                                onClick={() => props.onClear(period.id, day.id)}
                                disabled={isBusy}
                                className="absolute right-1 top-1 text-slate-300 transition-colors hover:text-red-600 disabled:cursor-not-allowed"
                                aria-label={`Clear ${name}`}
                              >
                                <X className="size-3.5" />
                              </button>
                            )}
                            <select
                              aria-label={name}
                              aria-describedby={error ? errorId : undefined}
                              value={entry?.subject.id ?? ''}
                              disabled={isBusy}
                              onChange={(event) => props.onAssign(period.id, day.id, event.target.value)}
                              className="block w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 pr-5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-50"
                            >
                              <option value="">Add subject</option>
                              {entry && !props.subjects.some((row) => row.subject.id === entry.subject.id) && (
                                <option value={entry.subject.id}>{entry.subject.name}</option>
                              )}
                              {props.subjects.map((row) => (
                                <option key={row.id} value={row.subject.id} disabled={!row.teacher}>
                                  {row.teacher ? row.subject.name : `${row.subject.name} (no teacher)`}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : (
                          entry && <p className="text-xs font-medium text-slate-900">{label(entry)}</p>
                        )}
                        {entry && caption && <p className="text-xs text-slate-500">{caption(entry)}</p>}
                        {error && (
                          <p id={errorId} role="alert" className="text-xs text-red-600">
                            {error}
                          </p>
                        )}
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
  )
}
