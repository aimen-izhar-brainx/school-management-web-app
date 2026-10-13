import { Plus, Trash2, UserRound, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/errorMessage'
import { api, ApiError } from '../lib/http'

export interface TeacherOption {
  id: string
  name: string
}

interface SectionRow {
  id: string
  name: string
  classTeacher: TeacherOption | null
}

interface ClassSectionsPanelProps {
  classId: string
  className: string
  canManage: boolean
  teachers: TeacherOption[]
  /** True when the teacher list failed to load, so an empty list is not mistaken for "no teachers". */
  teachersError?: boolean
  /** The class itself no longer exists on the server: the parent should resync its list. */
  onClassGone: () => void
}

type LoadStatus = 'loading' | 'ready' | 'error'

const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404

const compareByName = (a: { name: string }, b: { name: string }) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase())

/** Sections of one class, backed by /classes/:classId/sections. Render with `key={classId}` so state resets per class. */
export function ClassSectionsPanel({
  classId,
  className,
  canManage,
  teachers,
  teachersError = false,
  onClassGone,
}: ClassSectionsPanelProps) {
  const [sections, setSections] = useState<SectionRow[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [notice, setNotice] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [busyIds, setBusyIds] = useState<string[]>([])

  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const isMounted = useRef(true)
  const latestRequest = useRef(0)
  const onClassGoneRef = useRef(onClassGone)
  useEffect(() => {
    onClassGoneRef.current = onClassGone
  })
  const sectionsUrl = `/classes/${classId}/sections`

  const loadSections = useCallback(() => {
    const request = ++latestRequest.current
    const isCurrent = () => isMounted.current && request === latestRequest.current
    return api.get<SectionRow[]>(sectionsUrl).then(
      (rows) => {
        if (!isCurrent()) return
        setSections(rows)
        setStatus('ready')
      },
      (error: unknown) => {
        if (!isCurrent()) return
        setStatus('error')
        if (isNotFound(error)) onClassGoneRef.current()
      },
    )
  }, [sectionsUrl])

  useEffect(() => {
    isMounted.current = true
    void loadSections()
    return () => {
      isMounted.current = false
    }
  }, [loadSections])

  const setBusy = (id: string, busy: boolean) =>
    setBusyIds((prev) => (busy ? [...prev, id] : prev.filter((existing) => existing !== id)))

  const setRowError = (id: string, message: string | null) =>
    setRowErrors((prev) => {
      const next = { ...prev }
      if (message) next[id] = message
      else delete next[id]
      return next
    })

  /** Runs a per-section write: guards re-entry, maps failures to a message, and resyncs on 404. */
  const runRowAction = async (id: string, action: () => Promise<void>) => {
    if (busyIds.includes(id)) return
    setNotice(null)
    setRowError(id, null)
    setBusy(id, true)
    try {
      await action()
    } catch (error) {
      if (!isMounted.current) return
      if (isNotFound(error)) {
        setNotice(errorMessage(error))
        await loadSections()
      } else {
        setRowError(id, errorMessage(error))
      }
    } finally {
      if (isMounted.current) setBusy(id, false)
    }
  }

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isAdding) return
    setAddError(null)
    setNotice(null)

    const name = newName.trim()
    if (!name) {
      setAddError('Please enter a section name.')
      return
    }

    setIsAdding(true)
    try {
      const created = await api.post<{ id: string; name: string }>(sectionsUrl, { name })
      if (!isMounted.current) return
      setSections((prev) => [...prev, { id: created.id, name: created.name, classTeacher: null }].sort(compareByName))
      setNewName('')
    } catch (error) {
      if (!isMounted.current) return
      setAddError(errorMessage(error))
      if (isNotFound(error)) onClassGoneRef.current()
    } finally {
      if (isMounted.current) setIsAdding(false)
    }
  }

  const handleRemove = (id: string) => {
    if (!window.confirm('Remove this section? Any students in it will be unassigned. This cannot be undone.')) return
    void runRowAction(id, async () => {
      await api.delete(`${sectionsUrl}/${id}`)
      if (isMounted.current) setSections((prev) => prev.filter((section) => section.id !== id))
    })
  }

  const handleAssign = (id: string, teacherId: string) => {
    void runRowAction(id, async () => {
      await api.patch(`${sectionsUrl}/${id}/class-teacher`, {
        teacherId: teacherId || null,
      })
      if (!isMounted.current) return
      const teacher = teachers.find((option) => option.id === teacherId) ?? null
      if (teacherId && !teacher) {
        await loadSections()
        return
      }
      setSections((prev) =>
        prev.map((section) => (section.id === id ? { ...section, classTeacher: teacher } : section)),
      )
    })
  }

  return (
    <section>
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-violet-50 text-violet-600">
          <Users className="size-4" />
        </span>
        <h3 className="text-sm font-semibold text-slate-700">Sections</h3>
      </div>

      {notice && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          {notice}
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          Could not load sections. Please refresh and try again.
        </p>
      )}
      {canManage && teachersError && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          Couldn&apos;t load teachers. Please refresh.
        </p>
      )}

      <div className="mt-3 space-y-3">
        {sections.map((section) => {
          const busy = busyIds.includes(section.id)
          const current = section.classTeacher
          return (
            <div key={section.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">
                  {className} &ndash; {section.name}
                </span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleRemove(section.id)}
                    disabled={busy}
                    className="flex items-center gap-1 text-xs font-medium text-red-600 transition-colors hover:text-red-700 disabled:opacity-60"
                  >
                    <Trash2 className="size-3.5" />
                    Remove
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label
                  htmlFor={`class-teacher-${section.id}`}
                  className="flex items-center gap-2 text-xs font-medium text-slate-600"
                >
                  <UserRound className="size-3.5" />
                  Class teacher
                </label>
                {canManage ? (
                  <select
                    id={`class-teacher-${section.id}`}
                    value={current?.id ?? ''}
                    disabled={busy}
                    onChange={(event) => handleAssign(section.id, event.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:opacity-60"
                  >
                    <option value="">Unassigned</option>
                    {current && !teachers.some((teacher) => teacher.id === current.id) && (
                      <option value={current.id}>{current.name}</option>
                    )}
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span id={`class-teacher-${section.id}`} className="text-xs text-slate-900">
                    {current?.name ?? 'Unassigned'}
                  </span>
                )}
              </div>

              {rowErrors[section.id] && (
                <p role="alert" className="mt-2 text-xs text-red-600">
                  {rowErrors[section.id]}
                </p>
              )}
            </div>
          )
        })}
        {status === 'loading' && <p className="text-xs text-slate-400">Loading sections...</p>}
        {status === 'ready' && sections.length === 0 && <p className="text-xs text-slate-400">No sections yet.</p>}
      </div>

      {canManage && (
        <>
          <form onSubmit={handleAdd} className="mt-4 flex max-w-xs gap-2" noValidate>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. C"
              aria-label="New section name"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
            <button
              type="submit"
              disabled={isAdding}
              className="flex shrink-0 items-center justify-center rounded-lg bg-violet-600 px-3 py-2 text-white transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-60"
              aria-label="Add section"
            >
              <Plus className="size-4" />
            </button>
          </form>
          {addError && (
            <p role="alert" className="mt-1.5 text-xs text-red-600">
              {addError}
            </p>
          )}
        </>
      )}
    </section>
  )
}
