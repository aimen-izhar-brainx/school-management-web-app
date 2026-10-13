import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { errorMessage, isNotFound } from '../lib/errorMessage'
import { api } from '../lib/http'
import type { Subject } from '../lib/types'

const GONE_MESSAGE = 'This subject no longer exists.'

interface SubjectCatalogManagerProps {
  catalog: Subject[]
  onRenamed: (subject: Subject) => void
  onDeleted: (subjectId: string) => void
  /** A subject vanished on the server: the parent should refetch the catalog and class subjects. */
  onGone: () => Promise<unknown>
}

/** Admin-only rename and delete controls for the subject catalog. State of the catalog itself lives in the parent. */
export function SubjectCatalogManager({ catalog, onRenamed, onDeleted, onGone }: SubjectCatalogManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busyKeys, setBusyKeys] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [goneNotice, setGoneNotice] = useState<string | null>(null)

  const inFlight = useRef(new Set<string>())
  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  const renameButtons = useRef(new Map<string, HTMLButtonElement>())
  const headingRef = useRef<HTMLHeadingElement>(null)
  const pendingFocus = useRef<string | null>(null)

  // Runs after every commit: focus is applied once the target element exists.
  useEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    const element = target === 'heading' ? headingRef.current : renameButtons.current.get(target)
    if (element) {
      element.focus()
      pendingFocus.current = null
    }
  })

  const setBusy = (key: string, busy: boolean) => {
    if (busy) inFlight.current.add(key)
    else inFlight.current.delete(key)
    setBusyKeys((prev) => (busy ? [...prev, key] : prev.filter((existing) => existing !== key)))
  }

  const setError = (id: string, message: string | null) =>
    setErrors((prev) => {
      const next = { ...prev }
      if (message) next[id] = message
      else delete next[id]
      return next
    })

  /** Guards re-entry per subject and action, maps failures to a message, and resyncs on 404. */
  const runAction = async (subject: Subject, action: string, run: () => Promise<void>) => {
    const key = `${action}:${subject.id}`
    if (inFlight.current.has(key)) return
    setError(subject.id, null)
    setGoneNotice(null)
    setBusy(key, true)
    try {
      await run()
    } catch (error) {
      if (!isMounted.current) return
      if (isNotFound(error)) {
        setGoneNotice(GONE_MESSAGE)
        setEditingId((prev) => (prev === subject.id ? null : prev))
        await onGone()
      } else {
        setError(subject.id, errorMessage(error))
      }
    } finally {
      if (isMounted.current) setBusy(key, false)
    }
  }

  const startEdit = (subject: Subject) => {
    setEditingId(subject.id)
    setDraft(subject.name)
    setError(subject.id, null)
  }

  const cancelEdit = () => {
    if (editingId) {
      setError(editingId, null)
      pendingFocus.current = editingId
    }
    setEditingId(null)
  }

  const handleSave = (event: FormEvent<HTMLFormElement>, subject: Subject) => {
    event.preventDefault()
    const name = draft.trim()
    if (!name) {
      setError(subject.id, 'Please enter a subject name.')
      return
    }
    return runAction(subject, 'rename', async () => {
      const updated = await api.patch<Subject>(`/subjects/${subject.id}`, { name })
      if (!isMounted.current) return
      pendingFocus.current = subject.id
      onRenamed(updated)
      setEditingId((prev) => (prev === subject.id ? null : prev))
    })
  }

  const handleDelete = (subject: Subject) => {
    if (inFlight.current.has(`delete:${subject.id}`)) return
    if (!window.confirm(`Delete subject "${subject.name}"?`)) return
    return runAction(subject, 'delete', async () => {
      await api.delete(`/subjects/${subject.id}`)
      if (!isMounted.current) return
      pendingFocus.current = 'heading'
      onDeleted(subject.id)
      setEditingId((prev) => (prev === subject.id ? null : prev))
    })
  }

  return (
    <div className="mt-4">
      <h4 ref={headingRef} tabIndex={-1} className="text-xs font-semibold uppercase tracking-wide text-slate-500">Manage subjects</h4>
      <ul className="mt-2 space-y-1.5">
        {catalog.map((subject) => {
          const renaming = busyKeys.includes(`rename:${subject.id}`)
          const deleting = busyKeys.includes(`delete:${subject.id}`)
          const busy = renaming || deleting
          const otherEditing = editingId !== null && editingId !== subject.id
          return (
            <li key={subject.id}>
              {editingId === subject.id ? (
                <form onSubmit={(event) => void handleSave(event, subject)} className="flex max-w-sm gap-2" noValidate>
                  <input
                    aria-label="Subject name"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    disabled={busy}
                    className="block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={busy}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-3 text-sm text-slate-900">
                  <span>{subject.name}</span>
                  <button
                    type="button"
                    ref={(element) => {
                      if (element) renameButtons.current.set(subject.id, element)
                      else renameButtons.current.delete(subject.id)
                    }}
                    onClick={() => startEdit(subject)}
                    disabled={busy || otherEditing}
                    aria-label={`Rename ${subject.name}`}
                    className="text-slate-400 transition-colors hover:text-slate-700 disabled:opacity-60"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(subject)}
                    disabled={busy || otherEditing}
                    aria-label={`Delete ${subject.name}`}
                    className="text-slate-400 transition-colors hover:text-red-600 disabled:opacity-60"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
              {errors[subject.id] && (
                <p role="alert" className="mt-1 text-xs text-red-600">
                  {errors[subject.id]}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {goneNotice && (
        <p role="alert" className="mt-1.5 text-xs text-red-600">
          {goneNotice}
        </p>
      )}
    </div>
  )
}
