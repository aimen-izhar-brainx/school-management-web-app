import { Megaphone, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import type { AuthUser } from '../lib/auth'
import { errorMessage } from '../lib/errorMessage'
import { api } from '../lib/http'
import { audienceLabel, formatNoticeDate } from '../lib/notices'
import type { Notice } from '../lib/types'
import { DashboardShell } from './DashboardShell'

interface ClassOption {
  id: string
  name: string
}

interface NoticeBoardPageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

/**
 * Notice board for the whole school. Admin & teachers can post (school-wide or to one class); every role
 * can read. The API only returns notices the signed-in user is meant to see.
 */
export function NoticeBoardPage({ user, onBack, onSignOut }: NoticeBoardPageProps) {
  const [notices, setNotices] = useState<Notice[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [classId, setClassId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const canPost = user.role === 'admin' || user.role === 'teacher'

  useEffect(() => {
    let cancelled = false
    api
      .get<Notice[]>('/notices')
      .then((data) => !cancelled && setNotices(data))
      .catch((error: unknown) => !cancelled && setLoadError(errorMessage(error)))
    if (canPost) {
      api
        .get<ClassOption[]>('/classes')
        .then((data) => !cancelled && setClasses(data))
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
  }, [canPost])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    if (!trimmedTitle || !trimmedDescription) {
      setFormError('Please add both a title and a description.')
      return
    }

    setSubmitting(true)
    try {
      const created = await api.post<Notice>('/notices', {
        title: trimmedTitle,
        description: trimmedDescription,
        classId: classId || null,
      })
      setNotices((prev) => [created, ...(prev ?? [])])
      setTitle('')
      setDescription('')
      setClassId('')
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    setActionError(null)
    try {
      await api.delete(`/notices/${id}`)
      setNotices((prev) => prev?.filter((notice) => notice.id !== id) ?? null)
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Notices</h1>
      <p className="mt-1 text-sm text-slate-500">
        {canPost
          ? 'Post announcements for the whole school or a specific class.'
          : 'Announcements for the whole school and for your class.'}
      </p>

      {canPost && (
        <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Megaphone className="size-4 text-violet-600" />
            Post a notice
          </h2>

          <div>
            <label htmlFor="notice-title" className="block text-xs font-medium text-slate-700">
              Title
            </label>
            <input
              id="notice-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Annual Sports Day"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <div>
            <label htmlFor="notice-description" className="block text-xs font-medium text-slate-700">
              Description
            </label>
            <textarea
              id="notice-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Details for the announcement"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <div>
            <label htmlFor="notice-audience" className="block text-xs font-medium text-slate-700">
              Target audience
            </label>
            <select
              id="notice-audience"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              className="mt-1.5 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">All (school-wide)</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>

          {formError && (
            <p role="alert" className="text-xs text-red-600">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-1.5 disabled:opacity-60 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
          >
            <Megaphone className="size-4" />
            Post notice
          </button>
        </form>
      )}

      {actionError && (
        <p role="alert" className="mt-4 text-xs text-red-600">
          {actionError}
        </p>
      )}

      <div className="mt-8 space-y-3">
        {notices === null && !loadError && <p className="text-sm text-slate-500">Loading notices…</p>}
        {loadError && (
          <p role="alert" className="text-sm text-red-600">
            {loadError}
          </p>
        )}
        {notices?.map((notice) => (
          <div key={notice.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                  <Megaphone className="size-4" />
                </span>
                <h3 className="text-sm font-semibold text-slate-900">{notice.title}</h3>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {audienceLabel(notice)}
                </span>
                {notice.canDelete && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(notice.id)}
                    className="text-slate-400 transition-colors hover:text-red-600"
                    aria-label={`Delete ${notice.title}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </div>

            <p className="mt-2 text-sm text-slate-600">{notice.description}</p>

            <p className="mt-3 text-xs text-slate-400">
              {notice.postedBy} &middot; {notice.postedByRole === 'admin' ? 'Admin' : 'Teacher'} &middot;{' '}
              {formatNoticeDate(notice.createdAt)}
            </p>
          </div>
        ))}

        {notices?.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No notices yet.
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
