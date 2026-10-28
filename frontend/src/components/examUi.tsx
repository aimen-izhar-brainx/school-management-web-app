import { CircleAlert, CircleCheck, Clock, RotateCw, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { markingStatus, secondaryButton, type MarkingStatus } from './examStyles'

const STATUS_STYLE: Record<MarkingStatus, { label: string; Icon: LucideIcon; className: string }> = {
  complete: { label: 'All marked', Icon: CircleCheck, className: 'bg-emerald-50 text-emerald-800' },
  partial: { label: 'Partly marked', Icon: Clock, className: 'bg-amber-50 text-amber-800' },
  none: { label: 'Not started', Icon: CircleAlert, className: 'bg-slate-100 text-slate-700' },
}

/** Status is always icon + label, never colour alone. */
export function MarkingBadge({ entered, total }: { entered: number; total: number }) {
  const { label, Icon, className } = STATUS_STYLE[markingStatus(entered, total)]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${className}`}>
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </span>
  )
}

/** Skeleton shaped like the real layout (page header, tab row, table) so content arriving doesn't shift anything. */
export function ExamsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading exams" className="animate-pulse space-y-4">
      <div className="h-10 w-full max-w-md rounded-lg bg-slate-200" />
      <div className="rounded-xl border border-slate-200 bg-white">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-center gap-4 border-b border-slate-100 p-4 last:border-b-0">
            <div className="h-4 w-1/4 rounded bg-slate-200" />
            <div className="h-4 w-1/5 rounded bg-slate-200" />
            <div className="ml-auto h-4 w-1/6 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Plain-language failure with a way to recover. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-white p-6 text-center">
      <CircleAlert className="mx-auto size-6 text-red-700" aria-hidden="true" />
      <p className="mt-2 text-base font-semibold text-slate-900">We couldn’t load exams</p>
      <p className="mt-1 text-sm text-slate-600">{message} Check your connection and try again.</p>
      <button type="button" onClick={onRetry} className={`${secondaryButton} mt-4`}>
        <RotateCw className="size-4" aria-hidden="true" />
        Try again
      </button>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
      <Icon className="mx-auto size-6 text-slate-500" aria-hidden="true" />
      <p className="mt-2 text-base font-semibold text-slate-900">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-600">{children}</div>}
    </div>
  )
}
