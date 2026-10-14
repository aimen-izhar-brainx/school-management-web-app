import { Megaphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/http'
import { audienceLabel, formatNoticeDate } from '../lib/notices'
import type { Notice } from '../lib/types'

const LIMIT = 3

interface LatestNoticesProps {
  onViewAll: () => void
}

/** Dashboard card with the newest notices relevant to the signed-in user. */
export function LatestNotices({ onViewAll }: LatestNoticesProps) {
  const [notices, setNotices] = useState<Notice[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get<Notice[]>(`/notices?limit=${LIMIT}`)
      .then((data) => !cancelled && setNotices(data))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section aria-label="Latest notices" className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Latest notices</h2>
        <button type="button" onClick={onViewAll} className="text-xs font-medium text-violet-600 hover:text-violet-700">
          View all
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {failed ? (
          <p role="alert" className="text-xs text-red-600">
            Couldn&rsquo;t load notices.
          </p>
        ) : notices === null ? (
          <p className="text-xs text-slate-400">Loading notices…</p>
        ) : notices.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
            No notices yet.
          </p>
        ) : (
          notices.map((notice) => (
            <div key={notice.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Megaphone className="size-4 shrink-0 text-violet-600" />
                  <h3 className="text-sm font-semibold text-slate-900">{notice.title}</h3>
                </div>
                <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {audienceLabel(notice)}
                </span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{notice.description}</p>
              <p className="mt-2 text-xs text-slate-400">
                {notice.postedBy} &middot; {formatNoticeDate(notice.createdAt)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
