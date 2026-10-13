import { BookOpen, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { AuthUser } from '../lib/auth'
import { errorMessage } from '../lib/errorMessage'
import { api, ApiError } from '../lib/http'
import { ClassSectionsPanel, type TeacherOption } from './ClassSectionsPanel'
import { DashboardShell } from './DashboardShell'

interface ClassesPageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

interface SubjectAssignment {
  name: string
  teacherId: string | null
}

interface SchoolClass {
  id: string
  name: string
  subjects: SubjectAssignment[]
}

const SUBJECT_LIBRARY = [
  'Mathematics',
  'English',
  'Science',
  'Social Studies',
  'Art',
  'Physical Education',
  'Computer Science',
  'Music',
]

/** Shape returned by the /classes API; subjects are still mocked locally (T-019). */
interface ApiClass {
  id: string
  name: string
}

type LoadStatus = 'loading' | 'ready' | 'error'

function withMockedDetails(apiClass: ApiClass, existing?: SchoolClass): SchoolClass {
  return { subjects: [], ...existing, ...apiClass }
}

/** Admin-only screen for managing classes (persisted via the API), plus sections (persisted) and still-mocked subjects. */
export function ClassesPage({ user, onBack, onSignOut }: ClassesPageProps) {
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)

  const [newClassName, setNewClassName] = useState('')
  const [classNameError, setClassNameError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [classActionError, setClassActionError] = useState<string | null>(null)

  const [editingClassId, setEditingClassId] = useState<string | null>(null)
  const [editingClassName, setEditingClassName] = useState('')
  const [isSavingRename, setIsSavingRename] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [newSubject, setNewSubject] = useState('')

  const canManageClasses = user.role === 'admin'

  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [teachersError, setTeachersError] = useState(false)
  useEffect(() => {
    if (!canManageClasses) return
    let cancelled = false
    api.get<TeacherOption[]>('/users?role=teacher').then(
      (rows) => {
        if (cancelled) return
        setTeachers(rows)
        setTeachersError(false)
      },
      () => {
        if (cancelled) return
        setTeachers([])
        setTeachersError(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [canManageClasses])

  const applyLoadedClasses = useCallback((apiClasses: ApiClass[]) => {
    setClasses((prev) => apiClasses.map((apiClass) => withMockedDetails(apiClass, prev.find((c) => c.id === apiClass.id))))
    setLoadStatus('ready')
  }, [])

  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  const loadClasses = useCallback(
    () =>
      api.get<ApiClass[]>('/classes').then(
        (apiClasses) => {
          if (isMounted.current) applyLoadedClasses(apiClasses)
        },
        () => {
          if (!isMounted.current) return
          // Do not present a stale list as current when the (re)load fails.
          setClasses([])
          setSelectedClassId(null)
          setLoadStatus('error')
        },
      ),
    [applyLoadedClasses],
  )

  useEffect(() => {
    void loadClasses()
  }, [loadClasses])

  /** The class no longer exists on the server (e.g. removed in another session): resync the list. */
  const handleClassGone = async () => {
    setEditingClassId(null)
    await loadClasses()
  }

  const selectedClass = classes.find((schoolClass) => schoolClass.id === selectedClassId) ?? null

  const updateClass = (classId: string, updater: (schoolClass: SchoolClass) => SchoolClass) => {
    setClasses((prev) => prev.map((schoolClass) => (schoolClass.id === classId ? updater(schoolClass) : schoolClass)))
  }

  const handleAddClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isCreating) return
    setClassNameError(null)

    const name = newClassName.trim()
    if (!name) {
      setClassNameError('Please enter a class name.')
      return
    }
    if (classes.some((schoolClass) => schoolClass.name.toLowerCase() === name.toLowerCase())) {
      setClassNameError('A class with this name already exists.')
      return
    }

    setIsCreating(true)
    try {
      const created = await api.post<ApiClass>('/classes', { name })
      setClasses((prev) => [...prev, withMockedDetails(created)])
      setSelectedClassId(created.id)
      setNewClassName('')
    } catch (error) {
      setClassNameError(errorMessage(error))
    } finally {
      setIsCreating(false)
    }
  }

  const startRenameClass = (schoolClass: SchoolClass) => {
    setEditingClassId(schoolClass.id)
    setEditingClassName(schoolClass.name)
  }

  const commitRenameClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = editingClassName.trim()
    if (!editingClassId || !name || isSavingRename) return

    setClassActionError(null)
    setIsSavingRename(true)
    try {
      const renamed = await api.patch<ApiClass>(`/classes/${editingClassId}`, { name })
      updateClass(renamed.id, (schoolClass) => ({ ...schoolClass, name: renamed.name }))
      setEditingClassId(null)
      setEditingClassName('')
    } catch (error) {
      setClassActionError(errorMessage(error))
      if (error instanceof ApiError && error.status === 404) await handleClassGone()
    } finally {
      setIsSavingRename(false)
    }
  }

  const handleDeleteClass = async (id: string) => {
    if (isDeleting) return
    if (!window.confirm('Delete this class? This cannot be undone.')) return

    setClassActionError(null)
    setIsDeleting(true)
    try {
      await api.delete(`/classes/${id}`)
      setClasses((prev) => prev.filter((schoolClass) => schoolClass.id !== id))
      setSelectedClassId((prev) => (prev === id ? null : prev))
    } catch (error) {
      setClassActionError(errorMessage(error))
      if (error instanceof ApiError && error.status === 404) await handleClassGone()
    } finally {
      setIsDeleting(false)
    }
  }

  const addSubject = (subject: string) => {
    if (!selectedClass) return
    if (selectedClass.subjects.some((existing) => existing.name === subject)) return
    updateClass(selectedClass.id, (schoolClass) => ({
      ...schoolClass,
      subjects: [...schoolClass.subjects, { name: subject, teacherId: null }],
    }))
  }

  const removeSubject = (subject: string) => {
    if (!selectedClass) return
    updateClass(selectedClass.id, (schoolClass) => ({
      ...schoolClass,
      subjects: schoolClass.subjects.filter((existing) => existing.name !== subject),
    }))
  }

  const handleAssignSubjectTeacher = (subject: string, teacherId: string) => {
    if (!selectedClass) return
    updateClass(selectedClass.id, (schoolClass) => ({
      ...schoolClass,
      subjects: schoolClass.subjects.map((existing) =>
        existing.name === subject ? { ...existing, teacherId: teacherId || null } : existing,
      ),
    }))
  }

  const handleAddCustomSubject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const subject = newSubject.trim()
    if (subject) addSubject(subject)
    setNewSubject('')
  }

  return (
    <>
      <DashboardShell onBack={onBack} onSignOut={onSignOut}>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Classes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create classes and sections, assign subjects and class teachers for {user.name.split(' ')[0]}&rsquo;s school.
        </p>

        <div className="mt-8 flex flex-col gap-8 lg:flex-row">
          <aside className="shrink-0 lg:w-64">
            <h2 className="text-sm font-semibold text-slate-700">All classes</h2>
            <ul className="mt-3 space-y-1.5">
              {loadStatus === 'error' && (
                <li role="alert" className="text-xs text-red-600">
                  Could not load classes. Please refresh and try again.
                </li>
              )}
              {classes.map((schoolClass) => (
                <li key={schoolClass.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedClassId(schoolClass.id)}
                    className={`flex w-full flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors ${
                      selectedClassId === schoolClass.id
                        ? 'border-violet-200 bg-violet-50 text-violet-700'
                        : 'border-transparent text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-sm font-semibold">{schoolClass.name}</span>
                  </button>
                </li>
              ))}
              {loadStatus === 'loading' && <li className="text-xs text-slate-400">Loading classes...</li>}
              {loadStatus === 'ready' && classes.length === 0 && (
                <li className="text-xs text-slate-400">No classes yet.</li>
              )}
            </ul>

            {canManageClasses && (
              <form onSubmit={handleAddClass} className="mt-4 space-y-2" noValidate>
                <label htmlFor="new-class-name" className="block text-xs font-medium text-slate-700">
                  New class
                </label>
                <div className="flex gap-2">
                  <input
                    id="new-class-name"
                    value={newClassName}
                    onChange={(event) => setNewClassName(event.target.value)}
                    placeholder="e.g. Grade 7"
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="flex shrink-0 items-center justify-center rounded-lg bg-violet-600 px-3 py-2 text-white transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-60"
                    aria-label="Add class"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                {classNameError && (
                  <p role="alert" className="text-xs text-red-600">
                    {classNameError}
                  </p>
                )}
              </form>
            )}
          </aside>

          <div className="min-w-0 flex-1">
            {classActionError && (
              <p role="alert" className="mb-4 text-sm text-red-600">
                {classActionError}
              </p>
            )}
            {!selectedClass && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                Select a class from the list, or create a new one to get started.
              </div>
            )}

            {selectedClass && (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  {editingClassId === selectedClass.id ? (
                    <form onSubmit={commitRenameClass} className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={editingClassName}
                        onChange={(event) => setEditingClassName(event.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xl font-bold text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                      />
                      <button
                        type="submit"
                        disabled={isSavingRename}
                        className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
                      >
                        {isSavingRename ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingClassId(null)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <h2 className="text-xl font-bold text-slate-900">{selectedClass.name}</h2>
                  )}

                  {canManageClasses && editingClassId !== selectedClass.id && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => startRenameClass(selectedClass)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        <Pencil className="size-3.5" />
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClass(selectedClass.id)}
                        disabled={isDeleting}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                      >
                        <Trash2 className="size-3.5" />
                        Delete class
                      </button>
                    </div>
                  )}
                </div>

                <section>
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                      <BookOpen className="size-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-slate-700">Subjects</h3>
                  </div>

                  <div className="mt-3 space-y-2">
                    {selectedClass.subjects.map((subject) => (
                      <div
                        key={subject.name}
                        className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5"
                      >
                        <span className="text-sm font-medium text-slate-900">{subject.name}</span>
                        <select
                          value={subject.teacherId ?? ''}
                          onChange={(event) => handleAssignSubjectTeacher(subject.name, event.target.value)}
                          className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                        >
                          <option value="">Unassigned</option>
                          {teachers.map((teacher) => (
                            <option key={teacher.id} value={teacher.id}>
                              {teacher.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeSubject(subject.name)}
                          className="text-slate-400 transition-colors hover:text-red-600"
                          aria-label={`Remove ${subject.name}`}
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                    {selectedClass.subjects.length === 0 && (
                      <p className="text-xs text-slate-400">No subjects assigned yet.</p>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {SUBJECT_LIBRARY.filter(
                      (subject) => !selectedClass.subjects.some((existing) => existing.name === subject),
                    ).map((subject) => (
                      <button
                        key={subject}
                        type="button"
                        onClick={() => addSubject(subject)}
                        className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100"
                      >
                        <Plus className="size-3.5" />
                        {subject}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleAddCustomSubject} className="mt-3 flex max-w-xs gap-2">
                    <input
                      value={newSubject}
                      onChange={(event) => setNewSubject(event.target.value)}
                      placeholder="Add another subject"
                      className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    />
                    <button
                      type="submit"
                      className="flex shrink-0 items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-slate-600 transition-colors hover:bg-slate-50"
                      aria-label="Add subject"
                    >
                      <Plus className="size-4" />
                    </button>
                  </form>
                </section>

                <ClassSectionsPanel
                  key={selectedClass.id}
                  classId={selectedClass.id}
                  className={selectedClass.name}
                  canManage={canManageClasses}
                  teachers={teachers}
                  teachersError={teachersError}
                  onClassGone={handleClassGone}
                />
              </div>
            )}
          </div>
        </div>
      </DashboardShell>

    </>
  )
}
