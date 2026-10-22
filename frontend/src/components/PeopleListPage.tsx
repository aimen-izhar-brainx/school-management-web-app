import { GraduationCap, Trash2, UserPlus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AuthUser } from '../lib/auth'
import {
  deleteStudent,
  deleteTeacher,
  listStudents,
  listTeachers,
  type DirectoryTab,
  type PersonTab,
  type Student,
  type Teacher,
} from '../lib/people'
import { DashboardShell } from './DashboardShell'


interface PeopleListPageProps {
  user: AuthUser
  initialTab: DirectoryTab
  onBack: () => void
  onAdd: (tab: PersonTab) => void
  onSignOut: () => void
}

const PAGE_SIZE = 20

const tabs: { id: DirectoryTab; label: string; icon: typeof Users }[] = [
  { id: 'teacher', label: 'Teachers', icon: Users },
  { id: 'student', label: 'Students', icon: GraduationCap },
]

interface Row {
  id: string
  name: string
  email: string
  detail: string
  extra: string
}

const toTeacherRow = (t: Teacher): Row => ({
  id: t.id,
  name: t.user.name,
  email: t.user.email,
  detail: t.subject,
  extra: `ID ${t.employeeId}`,
})

const toStudentRow = (s: Student): Row => ({
  id: s.id,
  name: s.user.name,
  email: s.user.email,
  detail: s.section ? `${s.section.schoolClass.name} – ${s.section.name}` : '—',
  extra: `Roll ${s.rollNumber}`,
})

/** Admin directory: browse, page through and remove teachers and students stored on the server. */
export function PeopleListPage({ user, initialTab, onBack, onAdd, onSignOut }: PeopleListPageProps) {
  const [tab, setTab] = useState<DirectoryTab>(initialTab)
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; rows: Row[]; total: number } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const requestKey = `${tab}:${page}:${reloadKey}`
  const rows = loaded?.rows ?? []
  const total = loaded?.total ?? 0
  const isLoading = loaded?.key !== requestKey && failed?.key !== requestKey
  const error = actionError ?? (failed?.key === requestKey ? failed.message : null)

  useEffect(() => {
    let active = true
    const request =
      tab === 'teacher'
        ? listTeachers(page, PAGE_SIZE).then((r) => ({ rows: r.data.map(toTeacherRow), total: r.meta.total }))
        : listStudents(page, PAGE_SIZE).then((r) => ({ rows: r.data.map(toStudentRow), total: r.meta.total }))
    request
      .then((result) => active && setLoaded({ key: requestKey, ...result }))
      .catch((cause) => active && setFailed({ key: requestKey, message: cause instanceof Error ? cause.message : 'Could not load the list.' }))
    return () => {
      active = false
    }
  }, [tab, page, requestKey])

  const selectTab = (next: DirectoryTab) => {
    setActionError(null)
    setTab(next)
    setPage(1)
  }

  const handleDelete = async (row: Row) => {
    if (!window.confirm(`Delete ${row.name}? This removes their account too.`)) return
    setActionError(null)
    try {
      await (tab === 'teacher' ? deleteTeacher(row.id) : deleteStudent(row.id))
      // Step back a page if that was the last row on this one.
      if (rows.length === 1 && page > 1) setPage(page - 1)
      else setReloadKey((key) => key + 1)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not delete.')
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const noun = tab === 'teacher' ? 'teacher' : 'student'

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut}>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">People</h1>
          <p className="mt-1 text-sm text-slate-500">
            Teachers and students on record, {user.name.split(' ')[0]}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onAdd(tab)}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700"
        >
          <UserPlus className="size-4" />
          Add {noun}
        </button>
      </div>

      <div className="mt-6 flex gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => selectTab(id)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? 'border-violet-200 bg-violet-50 text-violet-700'
                : 'border-transparent text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No {noun}s yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
                  <p className="truncate text-xs text-slate-500">{row.email}</p>
                </div>
                <div className="hidden text-right text-xs text-slate-500 sm:block">
                  <p className="font-medium text-slate-700">{row.detail}</p>
                  <p>{row.extra}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Delete ${row.name}`}
                  onClick={() => void handleDelete(row)}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-50"
          >
            Previous
          </button>
          <span>
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage(page + 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </DashboardShell>
  )
}
