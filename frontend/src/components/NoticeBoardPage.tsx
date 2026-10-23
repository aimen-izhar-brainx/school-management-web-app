import { Megaphone, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import {
  audienceLabel,
  formatNoticeDate,
  type Notice,
  type NoticeAudience,
} from '../data/notices'
import { roles } from '../data/roles'
import type { AuthUser } from '../lib/auth'
import * as noticesApi from '../lib/notices'
import { DashboardShell } from './DashboardShell'

interface NoticeBoardPageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

/**
 * Notice board for the whole school. Admin & teachers can post; every role can read.
 * Admin/teacher see every notice (they need full visibility to manage the board); a student or
 * parent only sees notices targeted at "all" or at their own role — the /notices API enforces that.
 */
export function NoticeBoardPage({ user, onBack, onSignOut }: NoticeBoardPageProps) {
  const [notices, setNotices] = useState<Notice[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [audience, setAudience] = useState<NoticeAudience>('all')
  const [formError, setFormError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [posting, setPosting] = useState(false)

  const canPost = user.role === 'admin' || user.role === 'teacher'

  useEffect(() => {
    let active = true
    noticesApi
      .listNotices(1)
      .then((result) => {
        if (!active) return
        setNotices(result.items)
        setTotal(result.total)
      })
      .catch((error: unknown) => {
        if (active) setPageError(error instanceof Error ? error.message : 'Could not load notices.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    if (!trimmedTitle || !trimmedDescription) {
      setFormError('Please add both a title and a description.')
      return
    }

    setPosting(true)
    try {
      const created = await noticesApi.createNotice({
        title: trimmedTitle,
        description: trimmedDescription,
        audience,
      })
      setNotices((prev) => [created, ...prev])
      setTotal((prev) => prev + 1)
      setTitle('')
      setDescription('')
      setAudience('all')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not post the notice.')
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async (id: string) => {
    setPageError(null)
    try {
      await noticesApi.deleteNotice(id)
      setNotices((prev) => prev.filter((notice) => notice.id !== id))
      setTotal((prev) => prev - 1)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not delete the notice.')
    }
  }

  const handleLoadMore = async () => {
    setPageError(null)
    setLoadingMore(true)
    try {
      const result = await noticesApi.listNotices(page + 1)
      // Notices posted or deleted since the first load shift the pages, so skip repeats.
      setNotices((prev) => {
        const seen = new Set(prev.map((notice) => notice.id))
        return [...prev, ...result.items.filter((notice) => !seen.has(notice.id))]
      })
      setTotal(result.total)
      setPage((prev) => prev + 1)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not load more notices.')
    } finally {
      setLoadingMore(false)
    }
  }

  const canDelete = (notice: Notice) => user.role === 'admin' || notice.postedBy.id === user.id

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Notices</h1>
      <p className="mt-1 text-sm text-slate-500">
        {canPost
          ? 'Post announcements for everyone or a specific role.'
          : 'Announcements for the whole school and for you.'}
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
              value={audience}
              onChange={(event) => setAudience(event.target.value as NoticeAudience)}
              className="mt-1.5 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="all">All (school-wide)</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
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
            disabled={posting}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-60"
          >
            <Megaphone className="size-4" />
            {posting ? 'Posting…' : 'Post notice'}
          </button>
        </form>
      )}

      {pageError && (
        <p role="alert" className="mt-6 text-xs text-red-600">
          {pageError}
        </p>
      )}

      <div className="mt-8 space-y-3">
        {notices.map((notice) => (
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
                  {audienceLabel(notice.audience)}
                </span>
                {canDelete(notice) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(notice.id)}
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
              {notice.postedBy.name} &middot; {notice.postedBy.role === 'admin' ? 'Admin' : 'Teacher'} &middot;{' '}
              {formatNoticeDate(notice.createdAt)}
            </p>
          </div>
        ))}

        {notices.length < total && (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}

        {!loading && notices.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No notices yet.
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
