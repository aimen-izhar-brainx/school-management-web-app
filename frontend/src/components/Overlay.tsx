import { X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

interface OverlayProps {
  /** `modal` is a centered dialog for confirmations and single-record forms; `drawer` keeps the list visible beside it. */
  variant: 'modal' | 'drawer'
  title: string
  description?: string
  /** Modal width: `sm` (~448px) for confirmations, `md` (~576px) for forms. Ignored by drawers. */
  size?: 'sm' | 'md'
  /** When true, closing asks to discard changes first instead of closing silently. */
  dirty?: boolean
  onClose: () => void
  children: ReactNode
  /** Receives `requestClose` so a Cancel button goes through the same discard check as Esc and the backdrop. */
  footer?: ReactNode | ((requestClose: () => void) => ReactNode)
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible dialog shell shared by modals and drawers: dismissible via backdrop, Esc and the close
 * control, traps focus while open and restores it on close. The "discard changes?" prompt replaces
 * the footer in place so a modal is never stacked on another modal.
 */
export function Overlay({ variant, title, description, size = 'md', dirty = false, onClose, children, footer }: OverlayProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  const requestClose = useCallback(() => {
    if (dirty) setConfirmingDiscard(true)
    else onClose()
  }, [dirty, onClose])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const firstField = panel?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
    ;(firstField ?? panel)?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      requestClose()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const isDrawer = variant === 'drawer'
  const widthClass = isDrawer ? 'max-w-lg' : size === 'sm' ? 'max-w-md' : 'max-w-xl'

  return (
    <div className={`fixed inset-0 z-50 flex ${isDrawer ? 'justify-end' : 'items-center justify-center p-4'}`} onKeyDown={handleKeyDown}>
      <div className="overlay-backdrop absolute inset-0 bg-slate-900/50" onClick={requestClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex w-full ${widthClass} flex-col bg-white shadow-2xl focus:outline-none ${
          isDrawer ? 'overlay-drawer h-full' : 'overlay-modal max-h-full rounded-xl'
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-semibold text-slate-900">
              {title}
            </h2>
            {description && <p className="mt-1 text-xs text-slate-600">{description}</p>}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            title="Close"
            className="rounded-lg p-2 text-slate-600 transition-colors duration-150 ease-out hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">{children}</div>

        {confirmingDiscard ? (
          <div className="border-t border-slate-200 p-6" role="alertdialog" aria-label="Discard unsaved changes">
            <p className="text-sm font-semibold text-slate-900">Discard your unsaved changes?</p>
            <p className="mt-1 text-xs text-slate-600">Anything you entered since the last save will be lost.</p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmingDiscard(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 ease-out hover:bg-slate-50"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors duration-150 ease-out hover:bg-red-50"
              >
                Discard changes
              </button>
            </div>
          </div>
        ) : (
          footer && (
            <div className="border-t border-slate-200 p-6">{typeof footer === 'function' ? footer(requestClose) : footer}</div>
          )
        )}
      </div>
    </div>
  )
}
