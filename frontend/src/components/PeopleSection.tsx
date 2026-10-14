import { Mail, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { compareByName } from '../lib/compareByName'
import { errorMessage, isNotFound } from '../lib/errorMessage'
import { api } from '../lib/http'
import type { Person, PersonRole } from '../lib/types'
import { isValidEmail } from '../lib/validators'
import { emptyPersonForm, formFromPerson, type PersonFormValues } from '../lib/personForm'
import { PersonForm } from './PersonForm'

interface PeopleSectionProps {
  role: PersonRole
}

type LoadStatus = 'loading' | 'ready' | 'error'

const NOUN: Record<PersonRole, string> = { teacher: 'Teacher', student: 'Student', parent: 'Parent' }
const PLURAL: Record<PersonRole, string> = { teacher: 'Teachers', student: 'Students', parent: 'Parents' }

/** Profile fields sent for each role; the API ignores the rest, but we don't send them at all. */
const FIELDS: Record<PersonRole, (keyof PersonFormValues)[]> = {
  teacher: ['phone', 'gender', 'address', 'employeeId', 'department', 'joiningDate'],
  student: ['phone', 'gender', 'address', 'dateOfBirth', 'admissionDate', 'rollNumber', 'sectionId', 'parentId'],
  parent: ['phone', 'gender', 'address', 'relationship'],
}

/** Empty inputs are omitted on create and sent as null on edit so a cleared field is actually cleared. */
function buildPayload(role: PersonRole, values: PersonFormValues, isEditing: boolean) {
  const payload: Record<string, unknown> = { name: values.name.trim(), email: values.email.trim() }
  for (const field of FIELDS[role]) {
    const value = (values[field] as string).trim()
    if (value) payload[field] = value
    else if (isEditing) payload[field] = null
  }
  if (role === 'parent' && (isEditing || values.studentIds.length > 0)) payload.studentIds = values.studentIds
  return payload
}

function describe(person: Person): string {
  if (person.role === 'teacher') return [person.department, person.employeeId].filter(Boolean).join(' · ')
  if (person.role === 'student') {
    const place = person.section ? `${person.section.className} – ${person.section.name}` : 'No section'
    return person.parent ? `${place} · Parent: ${person.parent.name}` : place
  }
  return person.children.length > 0
    ? `Parent of ${person.children.map((child) => child.name).join(', ')}`
    : 'No linked students'
}

/** List + create/edit form for one role, backed by `/people`. Render with `key={role}` so state resets per tab. */
async function fetchPeople(role: PersonRole): Promise<Person[]> {
  const rows = await api.get<Person[]>(`/people?role=${role}`)
  return [...rows].sort(compareByName)
}

export function PeopleSection({ role }: PeopleSectionProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [sections, setSections] = useState<{ id: string; label: string }[]>([])
  const [students, setStudents] = useState<{ id: string; name: string }[]>([])
  const [parents, setParents] = useState<{ id: string; name: string }[]>([])

  const [pickerError, setPickerError] = useState(false)
  const [values, setValues] = useState<PersonFormValues>(emptyPersonForm)
  const [editing, setEditing] = useState<Person | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)
  const [rowNotice, setRowNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setPeople(await fetchPeople(role))
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [role])

  useEffect(() => {
    let ignore = false
    fetchPeople(role).then(
      (rows) => {
        if (ignore) return
        setPeople(rows)
        setStatus('ready')
      },
      () => {
        if (!ignore) setStatus('error')
      },
    )
    return () => {
      ignore = true
    }
  }, [role])

  // Lookup data for the link pickers. A failure is shown above the form; the list still works.
  useEffect(() => {
    let ignore = false
    void (async () => {
      try {
        if (role === 'student') {
          const [sectionRows, parentRows] = await Promise.all([
            api.get<{ id: string; name: string; className: string }[]>('/sections'),
            api.get<Person[]>('/people?role=parent'),
          ])
          if (ignore) return
          setSections(
            sectionRows
              .map((section) => ({ id: section.id, label: `${section.className} – ${section.name}` }))
              .sort((a, b) => a.label.localeCompare(b.label)),
          )
          setPickerError(false)
          setParents([...parentRows].sort(compareByName).map(({ id, name }) => ({ id, name })))
        } else if (role === 'parent') {
          const rows = await api.get<Person[]>('/people?role=student')
          if (ignore) return
          setPickerError(false)
          setStudents([...rows].sort(compareByName).map(({ id, name }) => ({ id, name })))
        }
      } catch {
        if (!ignore) setPickerError(true)
      }
    })()
    return () => {
      ignore = true
    }
  }, [role])

  const sectionOptions = useMemo(() => sections.map((s) => ({ value: s.id, label: s.label })), [sections])
  const parentOptions = useMemo(() => parents.map((p) => ({ value: p.id, label: p.name })), [parents])

  const resetForm = () => {
    setEditing(null)
    setValues(emptyPersonForm)
    setError(null)
  }

  const startEdit = (person: Person) => {
    setEditing(person)
    setValues(formFromPerson(person))
    setError(null)
    setNotice(null)
    setConfirmingId(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving) return
    setError(null)
    setNotice(null)

    const name = values.name.trim()
    if (!name) {
      setError(`Please enter the ${role}’s full name.`)
      return
    }
    if (!isValidEmail(values.email)) {
      setError('Please enter a valid email address.')
      return
    }

    setIsSaving(true)
    try {
      const payload = buildPayload(role, values, editing !== null)
      if (editing) {
        await api.patch<Person>(`/people/${editing.id}`, payload)
        setNotice(`${NOUN[role]} updated for ${name}.`)
      } else {
        await api.post<Person>('/people', { ...payload, role })
        setNotice(`${NOUN[role]} account created for ${name}.`)
      }
      setEditing(null)
      setValues(emptyPersonForm)
      await load()
    } catch (e) {
      setError(errorMessage(e))
      if (editing && isNotFound(e)) {
        setEditing(null)
        await load()
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (person: Person) => {
    setRowError(null)
    setRowNotice(null)
    try {
      await api.delete(`/people/${person.id}`)
      setConfirmingId(null)
      if (editing?.id === person.id) resetForm()
      setRowNotice(`${person.name} was deleted.`)
    } catch (e) {
      // 404 means it is already gone, which is what the admin wanted.
      if (isNotFound(e)) setRowNotice(`${person.name} was already deleted.`)
      else setRowError({ id: person.id, message: errorMessage(e) })
      setConfirmingId(null)
    }
    await load()
  }

  const handleInvite = async (person: Person) => {
    setRowError(null)
    setRowNotice(null)
    try {
      await api.post(`/people/${person.id}/invite`)
      setRowNotice(`Invite email sent to ${person.email}.`)
    } catch (e) {
      setRowError({ id: person.id, message: errorMessage(e) })
    }
  }

  return (
    <div className="space-y-10">
      {pickerError && (
        <p role="alert" className="mb-3 rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
          Could not load the {role === 'student' ? 'class and parent' : 'student'} lists, so they are empty. Reload the page to try again.
        </p>
      )}
      <PersonForm
        role={role}
        values={values}
        onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
        onSubmit={(event) => void handleSubmit(event)}
        onCancel={resetForm}
        isEditing={editing !== null}
        isSaving={isSaving}
        error={error}
        notice={notice}
        sectionOptions={sectionOptions}
        parentOptions={parentOptions}
        studentOptions={students}
      />

      <section aria-label={PLURAL[role]}>
        <h2 className="text-lg font-semibold text-slate-900">{PLURAL[role]}</h2>
        {rowNotice && <p className="mt-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-600">{rowNotice}</p>}

        {status === 'loading' && <p className="mt-3 text-sm text-slate-500">Loading&hellip;</p>}
        {status === 'error' && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            Could not load {PLURAL[role].toLowerCase()}.{' '}
            <button type="button" onClick={() => void load()} className="underline">
              Try again
            </button>
          </p>
        )}
        {status === 'ready' && people.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">No {PLURAL[role].toLowerCase()} yet.</p>
        )}

        <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
          {people.map((person) => (
            <li key={person.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{person.name}</p>
                  <p className="truncate text-sm text-slate-500">{person.email}</p>
                  <p className="truncate text-xs text-slate-400">{describe(person)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {confirmingId === person.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleDelete(person)}
                        className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700"
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <IconButton label={`Edit ${person.name}`} onClick={() => startEdit(person)}>
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton label={`Resend invite to ${person.name}`} onClick={() => void handleInvite(person)}>
                        <Mail className="size-4" />
                      </IconButton>
                      <IconButton label={`Delete ${person.name}`} onClick={() => setConfirmingId(person.id)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    </>
                  )}
                </div>
              </div>
              {rowError?.id === person.id && (
                <p role="alert" className="mt-2 text-sm text-red-600">
                  {rowError.message}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
    >
      {children}
    </button>
  )
}
