import { BookOpen, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { compareByName } from '../lib/compareByName'
import { errorMessage, isNotFound } from '../lib/errorMessage'
import { api } from '../lib/http'
import type { ClassSubject as ClassSubjectRow, Subject, TeacherOption } from '../lib/types'
import { SubjectCatalogManager } from './SubjectCatalogManager'

interface ClassSubjectsPanelProps {
  classId: string
  canManage: boolean
  teachers: TeacherOption[]
  /** True when the teacher list failed to load, so an empty list is not mistaken for "no teachers". */
  teachersError?: boolean
  /** The class itself no longer exists on the server: the parent should resync its list. */
  onClassGone: () => void
}

type LoadStatus = 'loading' | 'ready' | 'error'

const bySubjectName = (a: ClassSubjectRow, b: ClassSubjectRow) => compareByName(a.subject, b.subject)

/** Subjects of one class plus the subject catalog. Render with `key={classId}` so state resets per class. */
export function ClassSubjectsPanel({
  classId,
  canManage,
  teachers,
  teachersError = false,
  onClassGone,
}: ClassSubjectsPanelProps) {
  const [rows, setRows] = useState<ClassSubjectRow[]>([])
  const [rowsStatus, setRowsStatus] = useState<LoadStatus>('loading')
  const [catalog, setCatalog] = useState<Subject[]>([])
  const [catalogStatus, setCatalogStatus] = useState<LoadStatus>('loading')
  const [busyKeys, setBusyKeys] = useState<string[]>([])
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [quickAddError, setQuickAddError] = useState<string | null>(null)

  const [newSubject, setNewSubject] = useState('')
  const [newSubjectError, setNewSubjectError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const inFlight = useRef(new Set<string>())
  const isMounted = useRef(true)
  const latestRows = useRef(0)
  const latestCatalog = useRef(0)
  const onClassGoneRef = useRef(onClassGone)
  useEffect(() => {
    onClassGoneRef.current = onClassGone
  })
  const subjectsUrl = `/classes/${classId}/subjects`

  const loadRows = useCallback(() => {
    const request = ++latestRows.current
    const isCurrent = () => isMounted.current && request === latestRows.current
    return api.get<ClassSubjectRow[]>(subjectsUrl).then(
      (loaded) => {
        if (!isCurrent()) return
        setRows([...loaded].sort(bySubjectName))
        setRowsStatus('ready')
      },
      (error: unknown) => {
        if (!isCurrent()) return
        setRowsStatus('error')
        if (isNotFound(error)) onClassGoneRef.current()
      },
    )
  }, [subjectsUrl])

  const loadCatalog = useCallback(() => {
    const request = ++latestCatalog.current
    const isCurrent = () => isMounted.current && request === latestCatalog.current
    return api.get<Subject[]>('/subjects').then(
      (loaded) => {
        if (!isCurrent()) return
        setCatalog([...loaded].sort(compareByName))
        setCatalogStatus('ready')
      },
      () => {
        if (!isCurrent()) return
        setCatalogStatus('error')
      },
    )
  }, [])

  useEffect(() => {
    isMounted.current = true
    void loadRows()
    return () => {
      isMounted.current = false
    }
  }, [loadRows])

  useEffect(() => {
    if (!canManage) return
    void loadCatalog()
  }, [canManage, loadCatalog])

  const setBusy = (key: string, busy: boolean) => {
    if (busy) inFlight.current.add(key)
    else inFlight.current.delete(key)
    setBusyKeys((prev) => (busy ? [...prev, key] : prev.filter((existing) => existing !== key)))
  }

  const setRowError = (key: string, message: string | null) =>
    setRowErrors((prev) => {
      const next = { ...prev }
      if (message) next[key] = message
      else delete next[key]
      return next
    })

  /** Runs a per-subject write: guards re-entry, maps failures to a message, and resyncs on 404. */
  const runAction = async (key: string, onError: (message: string) => void, action: () => Promise<void>) => {
    if (inFlight.current.has(key)) return
    onError('')
    setBusy(key, true)
    try {
      await action()
    } catch (error) {
      if (!isMounted.current) return
      onError(errorMessage(error))
      if (isNotFound(error)) await Promise.all([loadRows(), loadCatalog()])
    } finally {
      if (isMounted.current) setBusy(key, false)
    }
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isCreating) return
    setNewSubjectError(null)

    const name = newSubject.trim()
    if (!name) {
      setNewSubjectError('Please enter a subject name.')
      return
    }

    setIsCreating(true)
    try {
      const created = await api.post<Subject>('/subjects', { name })
      if (!isMounted.current) return
      setCatalog((prev) => [...prev, created].sort(compareByName))
      setNewSubject('')
    } catch (error) {
      if (!isMounted.current) return
      setNewSubjectError(errorMessage(error))
    } finally {
      if (isMounted.current) setIsCreating(false)
    }
  }

  const handleQuickAdd = (subject: Subject) =>
    runAction(
      `add:${subject.id}`,
      (message) => setQuickAddError(message || null),
      async () => {
        const created = await api.post<ClassSubjectRow>(subjectsUrl, { subjectId: subject.id })
        if (!isMounted.current) return
        setRows((prev) => [...prev, created].sort(bySubjectName))
      },
    )

  const handleRemove = (row: ClassSubjectRow) =>
    runAction(
      row.id,
      (message) => setRowError(row.id, message || null),
      async () => {
        await api.delete(`${subjectsUrl}/${row.id}`)
        if (isMounted.current) setRows((prev) => prev.filter((existing) => existing.id !== row.id))
      },
    )

  const handleTeacher = (row: ClassSubjectRow, teacherId: string) =>
    runAction(
      row.id,
      (message) => setRowError(row.id, message || null),
      async () => {
        const updated = await api.patch<ClassSubjectRow>(`${subjectsUrl}/${row.id}/teacher`, {
          teacherId: teacherId || null,
        })
        if (!isMounted.current) return
        setRows((prev) => prev.map((existing) => (existing.id === row.id ? { ...existing, teacher: updated.teacher } : existing)))
      },
    )

  const handleRenamed = (updated: Subject) => {
    setCatalog((prev) => prev.map((subject) => (subject.id === updated.id ? updated : subject)).sort(compareByName))
    setRows((prev) =>
      prev.map((row) => (row.subject.id === updated.id ? { ...row, subject: updated } : row)).sort(bySubjectName),
    )
  }

  const handleDeleted = (subjectId: string) =>
    setCatalog((prev) => prev.filter((subject) => subject.id !== subjectId))

  const available =
    rowsStatus !== 'ready'
      ? []
      : catalog.filter((subject) => !rows.some((row) => row.subject.id === subject.id))

  return (
    <section>
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-violet-50 text-violet-600">
          <BookOpen className="size-4" />
        </span>
        <h3 className="text-sm font-semibold text-slate-700">Subjects</h3>
      </div>

      {rowsStatus === 'error' && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          Could not load subjects. Please refresh and try again.
        </p>
      )}
      {canManage && catalogStatus === 'error' && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          Could not load the subject catalog. Please refresh and try again.
        </p>
      )}
      {canManage && teachersError && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          Couldn&apos;t load teachers. Please refresh.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {rows.map((row) => {
          const busy = busyKeys.includes(row.id)
          const current = row.teacher
          return (
            <div key={row.id}>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
                <span className="text-sm font-medium text-slate-900">{row.subject.name}</span>
                {canManage ? (
                  <>
                    <select
                      aria-label={`Teacher for ${row.subject.name}`}
                      value={current?.id ?? ''}
                      disabled={busy}
                      onChange={(event) => void handleTeacher(row, event.target.value)}
                      className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:opacity-60"
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
                    <button
                      type="button"
                      onClick={() => void handleRemove(row)}
                      disabled={busy}
                      className="text-slate-400 transition-colors hover:text-red-600 disabled:opacity-60"
                      aria-label={`Remove ${row.subject.name}`}
                    >
                      <X className="size-4" />
                    </button>
                  </>
                ) : (
                  <span className="ml-auto text-xs text-slate-600">{current?.name ?? 'Unassigned'}</span>
                )}
              </div>
              {rowErrors[row.id] && (
                <p role="alert" className="mt-1 text-xs text-red-600">
                  {rowErrors[row.id]}
                </p>
              )}
            </div>
          )
        })}
        {rowsStatus === 'loading' && <p className="text-xs text-slate-400">Loading subjects...</p>}
        {rowsStatus === 'ready' && rows.length === 0 && <p className="text-xs text-slate-400">No subjects assigned yet.</p>}
      </div>

      {canManage && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {available.map((subject) => (
              <button
                key={subject.id}
                type="button"
                onClick={() => void handleQuickAdd(subject)}
                disabled={busyKeys.includes(`add:${subject.id}`)}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-60"
              >
                <Plus className="size-3.5" />
                {subject.name}
              </button>
            ))}
          </div>
          {quickAddError && (
            <p role="alert" className="mt-1.5 text-xs text-red-600">
              {quickAddError}
            </p>
          )}

          <form onSubmit={handleCreate} className="mt-3 flex max-w-xs gap-2" noValidate>
            <input
              value={newSubject}
              onChange={(event) => setNewSubject(event.target.value)}
              placeholder="Add another subject"
              aria-label="New subject"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
            <button
              type="submit"
              disabled={isCreating}
              className="flex shrink-0 items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
              aria-label="Add subject"
            >
              <Plus className="size-4" />
            </button>
          </form>
          {newSubjectError && (
            <p role="alert" className="mt-1.5 text-xs text-red-600">
              {newSubjectError}
            </p>
          )}

          <SubjectCatalogManager
            catalog={catalog}
            onRenamed={handleRenamed}
            onDeleted={handleDeleted}
            onGone={() => Promise.all([loadRows(), loadCatalog()])}
          />
        </>
      )}
    </section>
  )
}
