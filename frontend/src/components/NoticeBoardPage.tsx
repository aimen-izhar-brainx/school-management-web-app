import { Megaphone, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import {
  audienceLabel,
  formatNoticeDate,
  INITIAL_NOTICES,
  makeNoticeId,
  visibleToRole,
  type Notice,
  type NoticeAudience,
} from '../data/notices'
import { roles } from '../data/roles'
import type { AuthUser } from '../lib/auth'
import { DashboardShell } from './DashboardShell'

interface NoticeBoardPageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

/**
 * Notice board for the whole school. Admin & teachers can post; every role can read.
 * Admin/teacher see every notice (they need full visibility to manage the board); a student or
 * parent only sees notices targeted at "all" or at their own role. UI only — nothing is
 * persisted yet.
 */
export function NoticeBoardPage({ user, onBack, onSignOut }: NoticeBoardPageProps) {
  const [notices, setNotices] = useState<Notice[]>(INITIAL_NOTICES)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [audience, setAudience] = useState<NoticeAudience>('all')
  const [formError, setFormError] = useState<string | null>(null)

  const canPost = user.role === 'admin' || user.role === 'teacher'

  const visibleNotices =
    user.role === 'student' || user.role === 'parent' ? visibleToRole(notices, user.role) : notices

  const sortedNotices = [...visibleNotices].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    if (!trimmedTitle || !trimmedDescription) {
      setFormError('Please add both a title and a description.')
      return
    }

    const created: Notice = {
      id: makeNoticeId(),
      title: trimmedTitle,
      description: trimmedDescription,
      audience,
      postedBy: user.name,
      postedByRole: user.role === 'admin' ? 'admin' : 'teacher',
      createdAt: new Date().toISOString(),
    }
    setNotices((prev) => [created, ...prev])
    setTitle('')
    setDescription('')
    setAudience('all')
  }

  const handleDelete = (id: string) => {
    setNotices((prev) => prev.filter((notice) => notice.id !== id))
  }

  const canDelete = (notice: Notice) => user.role === 'admin' || notice.postedBy === user.name

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
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
          >
            <Megaphone className="size-4" />
            Post notice
          </button>
        </form>
      )}

      <div className="mt-8 space-y-3">
        {sortedNotices.map((notice) => (
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
              {notice.postedBy} &middot; {notice.postedByRole === 'admin' ? 'Admin' : 'Teacher'} &middot;{' '}
              {formatNoticeDate(notice.createdAt)}
            </p>
          </div>
        ))}

        {sortedNotices.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No notices yet.
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
