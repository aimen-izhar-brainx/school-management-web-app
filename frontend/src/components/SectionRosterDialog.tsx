import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { errorMessage, isNotFound } from '../lib/errorMessage'
import { compareByName } from '../lib/compareByName'
import { api } from '../lib/http'

interface StudentRow {
  id: string
  name: string
  sectionId: string | null
}

interface SectionRosterDialogProps {
  sectionId: string
  title: string
  onClose: () => void
  /** A write hit a 404: the section (or student) is gone, so the parent should resync its sections. */
  onNotFound: () => void
}

type LoadStatus = 'loading' | 'ready' | 'error'

const FOCUSABLE = 'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])'

/** Roster of one section with assign/unassign controls, backed by /users?role=student and PATCH /users/:id/section. */
export function SectionRosterDialog({ sectionId, title, onClose, onNotFound }: SectionRosterDialogProps) {
  const [students, setStudents] = useState<StudentRow[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [selectedId, setSelectedId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const isSavingRef = useRef(false)
  const isMounted = useRef(true)
  const latestRequest = useRef(0)

  const loadStudents = useCallback(() => {
    const request = ++latestRequest.current
    const isCurrent = () => isMounted.current && request === latestRequest.current
    return api.get<StudentRow[]>('/users?role=student').then(
      (rows) => {
        if (!isCurrent()) return
        setStudents([...rows].sort(compareByName))
        setStatus('ready')
      },
      () => {
        if (!isCurrent()) return
        setStatus('error')
      },
    )
  }, [])

  useEffect(() => {
    isMounted.current = true
    void loadStudents()
    return () => {
      isMounted.current = false
    }
  }, [loadStudents])

  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus()
    return () => previous?.focus()
  }, [])

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  /** Keeps Tab / Shift+Tab cycling inside the dialog. */
  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled'))
    if (focusable.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const roster = students.filter((student) => student.sectionId === sectionId)

  const moveStudent = async (studentId: string, target: string | null) => {
    if (isSavingRef.current) return
    isSavingRef.current = true
    setActionError(null)
    setIsSaving(true)
    try {
      await api.patch(`/users/${studentId}/section`, { sectionId: target })
      if (!isMounted.current) return
      setStudents((prev) =>
        prev.map((student) => (student.id === studentId ? { ...student, sectionId: target } : student)),
      )
      if (target) setSelectedId('')
    } catch (error) {
      if (!isMounted.current) return
      setActionError(errorMessage(error))
      if (isNotFound(error)) {
        onNotFound()
        await loadStudents()
      }
    } finally {
      isSavingRef.current = false
      if (isMounted.current) setIsSaving(false)
    }
  }

  const handleAssign = async () => {
    if (!selectedId) {
      setActionError('Please choose a student.')
      return
    }
    await moveStudent(selectedId, sectionId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={trapFocus}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl focus:outline-none"
      >
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>

        {status === 'loading' && <p className="mt-3 text-xs text-slate-400">Loading students...</p>}
        {status === 'error' && (
          <p role="alert" className="mt-3 text-xs text-red-600">
            Could not load students. Please close and try again.
          </p>
        )}

        {status === 'ready' && (
          <>
            <div className="mt-3 flex items-center gap-2">
              <label htmlFor={`roster-student-${sectionId}`} className="text-xs font-medium text-slate-600">
                Student
              </label>
              <select
                id={`roster-student-${sectionId}`}
                value={selectedId}
                disabled={isSaving || students.length === 0}
                onChange={(event) => setSelectedId(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:opacity-60"
              >
                <option value="">Select a student</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={isSaving || students.length === 0}
                onClick={() => void handleAssign()}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
              >
                Assign
              </button>
            </div>
            {students.length === 0 && <p className="mt-2 text-xs text-slate-400">No students yet.</p>}
            {actionError && (
              <p role="alert" className="mt-2 text-xs text-red-600">
                {actionError}
              </p>
            )}

            <ul aria-label="Roster" className="mt-4 space-y-1.5">
              {roster.map((student) => (
                <li
                  key={student.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900"
                >
                  <span>{student.name}</span>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void moveStudent(student.id, null)}
                    aria-label={`Unassign ${student.name}`}
                    className="text-xs font-medium text-red-600 transition-colors hover:text-red-700 disabled:opacity-60"
                  >
                    Unassign
                  </button>
                </li>
              ))}
            </ul>
            {roster.length === 0 && students.length > 0 && (
              <p className="mt-2 text-xs text-slate-400">No students in this section.</p>
            )}
          </>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
