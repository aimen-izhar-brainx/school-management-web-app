import { BookOpen, Pencil, Plus, Trash2, UserRound, Users, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { AuthUser } from '../lib/auth'
import { api, ApiError } from '../lib/http'
import { DashboardShell } from './DashboardShell'

interface ClassesPageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

interface RosterStudent {
  id: string
  name: string
  rollNumber: string
}

interface Section {
  id: string
  name: string
  classTeacherId: string | null
  roster: RosterStudent[]
}

interface SubjectAssignment {
  name: string
  teacherId: string | null
}

interface SchoolClass {
  id: string
  name: string
  subjects: SubjectAssignment[]
  sections: Section[]
}

const TEACHER_OPTIONS = [
  { id: 't1', name: 'Grace Kim' },
  { id: 't2', name: 'Daniel Ortiz' },
  { id: 't3', name: 'Priya Nair' },
  { id: 't4', name: 'Marcus Webb' },
  { id: 't5', name: 'Sofia Rossi' },
]

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

function teacherName(id: string | null): string | null {
  return TEACHER_OPTIONS.find((teacher) => teacher.id === id)?.name ?? null
}

let idCounter = 100
function makeId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

const GENERIC_ERROR = 'Something went wrong. Please try again.'

/** Shape returned by the /classes API; sections and subjects are still mocked locally (T-018/T-019). */
interface ApiClass {
  id: string
  name: string
}

type LoadStatus = 'loading' | 'ready' | 'error'

/** Client errors (4xx) carry a user-facing message from the API; anything else is shown generically. */
function errorMessage(error: unknown): string {
  return error instanceof ApiError && error.status < 500 ? error.message : GENERIC_ERROR
}

function withMockedDetails(apiClass: ApiClass, existing?: SchoolClass): SchoolClass {
  return { subjects: [], sections: [], ...existing, ...apiClass }
}

/** Admin-only screen for managing classes (persisted via the API), plus still-mocked sections, subjects and class teachers. */
export function ClassesPage({ user, onBack, onSignOut }: ClassesPageProps) {
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [rosterSectionId, setRosterSectionId] = useState<string | null>(null)

  const [newClassName, setNewClassName] = useState('')
  const [classNameError, setClassNameError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [classActionError, setClassActionError] = useState<string | null>(null)

  const [editingClassId, setEditingClassId] = useState<string | null>(null)
  const [editingClassName, setEditingClassName] = useState('')
  const [isSavingRename, setIsSavingRename] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [newSectionName, setNewSectionName] = useState('')
  const [sectionError, setSectionError] = useState<string | null>(null)

  const [newSubject, setNewSubject] = useState('')

  const canManageClasses = user.role === 'admin'

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
  const rosterSection = selectedClass?.sections.find((section) => section.id === rosterSectionId) ?? null

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

  const handleAddSection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSectionError(null)
    if (!selectedClass) return

    const name = newSectionName.trim()
    if (!name) {
      setSectionError('Please enter a section name.')
      return
    }
    if (selectedClass.sections.some((section) => section.name.toLowerCase() === name.toLowerCase())) {
      setSectionError('This section already exists.')
      return
    }

    const created: Section = { id: makeId('section'), name, classTeacherId: null, roster: [] }
    updateClass(selectedClass.id, (schoolClass) => ({ ...schoolClass, sections: [...schoolClass.sections, created] }))
    setNewSectionName('')
  }

  const handleDeleteSection = (sectionId: string) => {
    if (!selectedClass) return
    updateClass(selectedClass.id, (schoolClass) => ({
      ...schoolClass,
      sections: schoolClass.sections.filter((section) => section.id !== sectionId),
    }))
    if (rosterSectionId === sectionId) setRosterSectionId(null)
  }

  const handleAssignTeacher = (sectionId: string, teacherId: string) => {
    if (!selectedClass) return
    updateClass(selectedClass.id, (schoolClass) => ({
      ...schoolClass,
      sections: schoolClass.sections.map((section) =>
        section.id === sectionId ? { ...section, classTeacherId: teacherId || null } : section,
      ),
    }))
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
                          {TEACHER_OPTIONS.map((teacher) => (
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

                <section>
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                      <Users className="size-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-slate-700">Sections</h3>
                  </div>

                  <div className="mt-3 space-y-3">
                    {selectedClass.sections.map((section) => (
                      <div key={section.id} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-900">
                            {selectedClass.name} &ndash; {section.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteSection(section.id)}
                            className="flex items-center gap-1 text-xs font-medium text-red-600 transition-colors hover:text-red-700"
                          >
                            <Trash2 className="size-3.5" />
                            Remove
                          </button>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                            <UserRound className="size-3.5" />
                            Class teacher
                          </label>
                          <select
                            value={section.classTeacherId ?? ''}
                            onChange={(event) => handleAssignTeacher(section.id, event.target.value)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          >
                            <option value="">Unassigned</option>
                            {TEACHER_OPTIONS.map((teacher) => (
                              <option key={teacher.id} value={teacher.id}>
                                {teacher.name}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => setRosterSectionId(section.id)}
                            className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                          >
                            View roster ({section.roster.length})
                          </button>
                        </div>

                        {section.classTeacherId && (
                          <p className="mt-2 text-xs text-slate-500">
                            {teacherName(section.classTeacherId)} is the class teacher for this section.
                          </p>
                        )}
                      </div>
                    ))}
                    {selectedClass.sections.length === 0 && (
                      <p className="text-xs text-slate-400">No sections yet.</p>
                    )}
                  </div>

                  <form onSubmit={handleAddSection} className="mt-4 flex max-w-xs gap-2">
                    <input
                      value={newSectionName}
                      onChange={(event) => setNewSectionName(event.target.value)}
                      placeholder="e.g. C"
                      className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    />
                    <button
                      type="submit"
                      className="flex shrink-0 items-center justify-center rounded-lg bg-violet-600 px-3 py-2 text-white transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                      aria-label="Add section"
                    >
                      <Plus className="size-4" />
                    </button>
                  </form>
                  {sectionError && (
                    <p role="alert" className="mt-1.5 text-xs text-red-600">
                      {sectionError}
                    </p>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </DashboardShell>

      {rosterSection && selectedClass && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {selectedClass.name} &ndash; {rosterSection.name} roster
              </h3>
              <button
                type="button"
                onClick={() => setRosterSectionId(null)}
                className="text-slate-400 transition-colors hover:text-slate-600"
                aria-label="Close roster"
              >
                <X className="size-5" />
              </button>
            </div>

            <ul className="mt-4 max-h-80 space-y-1.5 overflow-y-auto">
              {rosterSection.roster.map((student) => (
                <li
                  key={student.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="text-slate-900">{student.name}</span>
                  <span className="text-xs text-slate-500">Roll no. {student.rollNumber}</span>
                </li>
              ))}
              {rosterSection.roster.length === 0 && (
                <li className="text-xs text-slate-400">No students enrolled in this section yet.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
