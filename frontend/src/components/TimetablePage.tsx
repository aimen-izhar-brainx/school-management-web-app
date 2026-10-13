import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthUser } from '../lib/auth'
import { compareByName } from '../lib/compareByName'
import { errorMessage, isNotFound } from '../lib/errorMessage'
import { api } from '../lib/http'
import { cellKey } from '../lib/timetable'
import type { ClassSubject, DayId, TimetableEntry, TimetablePeriod } from '../lib/types'
import { DashboardShell } from './DashboardShell'
import { TimetableGrid } from './TimetableGrid'

interface TimetablePageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

interface SectionChoice {
  id: string
  classId: string
  label: string
}

interface NamedRow {
  id: string
  name: string
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

const NOT_FOUND_MESSAGE = 'That slot or subject no longer exists. The timetable was refreshed.'
const bySubjectName = (a: ClassSubject, b: ClassSubject) => compareByName(a.subject, b.subject)

function toEntryMap(entries: TimetableEntry[]): Record<string, TimetableEntry> {
  return Object.fromEntries(entries.map((entry) => [cellKey(entry.periodId, entry.dayOfWeek), entry]))
}

/** Screen for building each section's weekly timetable. Only admins can edit; everyone else gets a read-only grid. */
export function TimetablePage({ user, onBack, onSignOut }: TimetablePageProps) {
  const editable = user.role === 'admin'

  const [sections, setSections] = useState<SectionChoice[]>([])
  const [periods, setPeriods] = useState<TimetablePeriod[]>([])
  const [directoryStatus, setDirectoryStatus] = useState<LoadStatus>('loading')
  const [directoryError, setDirectoryError] = useState<string | null>(null)

  const [selected, setSelected] = useState<SectionChoice | null>(null)
  const [gridStatus, setGridStatus] = useState<LoadStatus>('idle')
  const [gridError, setGridError] = useState<string | null>(null)
  const [entries, setEntries] = useState<Record<string, TimetableEntry>>({})
  const [subjects, setSubjects] = useState<ClassSubject[]>([])
  const [busyKeys, setBusyKeys] = useState<string[]>([])
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({})

  const inFlight = useRef(new Set<string>())
  const isMounted = useRef(true)
  const latestLoad = useRef(0)
  const selectionId = useRef(0)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    async function loadDirectory() {
      try {
        const [classes, loadedPeriods] = await Promise.all([
          api.get<NamedRow[]>('/classes'),
          api.get<TimetablePeriod[]>('/periods'),
        ])
        const sortedClasses = [...classes].sort(compareByName)
        const sectionLists = await Promise.all(
          sortedClasses.map((row) => api.get<NamedRow[]>(`/classes/${row.id}/sections`)),
        )
        if (!isMounted.current) return
        setSections(
          sortedClasses.flatMap((row, index) =>
            [...sectionLists[index]]
              .sort(compareByName)
              .map((section) => ({ id: section.id, classId: row.id, label: `${row.name} - ${section.name}` })),
          ),
        )
        setPeriods(loadedPeriods)
        setDirectoryStatus('ready')
      } catch (error) {
        if (!isMounted.current) return
        setDirectoryError(errorMessage(error))
        setDirectoryStatus('error')
      }
    }
    void loadDirectory()
  }, [])

  const loadSection = useCallback(
    async (section: SectionChoice) => {
      const request = ++latestLoad.current
      try {
        const [timetable, classSubjects] = await Promise.all([
          api.get<{ entries: TimetableEntry[] }>(`/sections/${section.id}/timetable`),
          editable ? api.get<ClassSubject[]>(`/classes/${section.classId}/subjects`) : Promise.resolve([]),
        ])
        if (!isMounted.current || request !== latestLoad.current) return
        setEntries(toEntryMap(timetable.entries))
        setSubjects([...classSubjects].sort(bySubjectName))
        setGridStatus('ready')
      } catch (error) {
        if (!isMounted.current || request !== latestLoad.current) return
        setGridError(errorMessage(error))
        setGridStatus('error')
      }
    },
    [editable],
  )

  const selectSection = (section: SectionChoice) => {
    selectionId.current += 1
    setSelected(section)
    setGridStatus('loading')
    setGridError(null)
    setEntries({})
    setSubjects([])
    setCellErrors({})
    void loadSection(section)
  }

  const mutate = async (periodId: string, day: DayId, send: () => Promise<TimetableEntry | null>) => {
    if (!selected) return
    const key = cellKey(periodId, day)
    const flightKey = `${selected.id}:${key}`
    if (inFlight.current.has(flightKey)) return
    inFlight.current.add(flightKey)
    setBusyKeys((prev) => [...prev, flightKey])
    setCellErrors(({ [key]: _cleared, ...rest }) => rest)
    const request = selectionId.current
    try {
      const saved = await send()
      if (!isMounted.current || request !== selectionId.current) return
      setEntries(({ [key]: _replaced, ...rest }) => (saved ? { ...rest, [key]: saved } : rest))
    } catch (error) {
      if (!isMounted.current || request !== selectionId.current) return
      const notFound = isNotFound(error)
      setCellErrors((prev) => ({ ...prev, [key]: notFound ? NOT_FOUND_MESSAGE : errorMessage(error) }))
      if (notFound) void loadSection(selected)
    } finally {
      inFlight.current.delete(flightKey)
      if (isMounted.current) setBusyKeys((prev) => prev.filter((busy) => busy !== flightKey))
    }
  }

  const handleAssign = (periodId: string, day: DayId, subjectId: string) => {
    if (!selected || !subjectId) return
    void mutate(periodId, day, () =>
      api.put<TimetableEntry>(`/sections/${selected.id}/timetable/${periodId}/${day}`, { subjectId }),
    )
  }

  const handleClear = (periodId: string, day: DayId) => {
    if (!selected) return
    void mutate(periodId, day, async () => {
      await api.delete(`/sections/${selected.id}/timetable/${periodId}/${day}`)
      return null
    })
  }

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-6xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Timetable</h1>
      <p className="mt-1 text-sm text-slate-500">
        {editable
          ? `Build the weekly timetable for each class section at ${user.name.split(' ')[0]}’s school.`
          : 'View the weekly timetable for each class section.'}
      </p>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        <aside className="shrink-0 lg:w-56">
          <h2 className="text-sm font-semibold text-slate-700">Class sections</h2>
          {directoryStatus === 'loading' && <p className="mt-3 text-sm text-slate-500">Loading...</p>}
          {directoryStatus === 'error' && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {directoryError}
            </p>
          )}
          <ul className="mt-3 space-y-1.5">
            {sections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => selectSection(section)}
                  className={`flex w-full items-center rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                    selected?.id === section.id
                      ? 'border-violet-200 bg-violet-50 text-violet-700'
                      : 'border-transparent text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
          {directoryStatus === 'ready' && sections.length === 0 && (
            <p className="mt-3 text-sm text-slate-500">No class sections yet.</p>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          {!selected && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Select a class section to {editable ? 'build' : 'view'} its timetable.
            </div>
          )}

          {selected && (
            <section>
              <h2 className="text-xl font-bold text-slate-900">{selected.label}</h2>
              {editable && (
                <p className="mt-1 text-sm text-slate-500">Pick a subject for each day &amp; period below.</p>
              )}
              {gridStatus === 'loading' && <p className="mt-4 text-sm text-slate-500">Loading...</p>}
              {gridStatus === 'error' && (
                <p role="alert" className="mt-4 text-sm text-red-600">
                  {gridError}
                </p>
              )}
              {gridStatus === 'ready' && (
                <TimetableGrid
                  periods={periods}
                  entries={entries}
                  subjects={subjects}
                  editable={editable}
                  busyKeys={busyKeys
                    .filter((busy) => busy.startsWith(`${selected.id}:`))
                    .map((busy) => busy.slice(selected.id.length + 1))}
                  cellErrors={cellErrors}
                  onAssign={handleAssign}
                  onClear={handleClear}
                />
              )}
            </section>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
