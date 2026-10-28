import { CircleAlert, CircleCheck, X } from 'lucide-react'

import type { Toast } from './useToasts'

/** Fixed top-right stack; the live region lets screen readers announce each new toast. */
export function ToastRegion({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 top-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`toast pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-4 shadow-lg ${
            toast.kind === 'error' ? 'border-red-200' : 'border-emerald-200'
          }`}
        >
          {toast.kind === 'error' ? (
            <CircleAlert className="size-5 shrink-0 text-red-700" aria-hidden="true" />
          ) : (
            <CircleCheck className="size-5 shrink-0 text-emerald-700" aria-hidden="true" />
          )}
          <p className="min-w-0 flex-1 text-sm text-slate-900">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="rounded-lg p-1 text-slate-600 transition-colors duration-150 ease-out hover:bg-slate-100"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
