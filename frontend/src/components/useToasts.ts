import { useCallback, useRef, useState } from 'react'

export interface Toast {
  id: number
  kind: 'success' | 'error'
  message: string
}

/** Success toasts clear themselves after 4.5s; error toasts stay until closed, since the user may have looked away. */
const SUCCESS_MS = 4500

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback(
    (kind: Toast['kind'], message: string) => {
      const id = ++nextId.current
      // Newest first so it stacks on top of older toasts.
      setToasts((current) => [{ id, kind, message }, ...current])
      if (kind === 'success') setTimeout(() => dismiss(id), SUCCESS_MS)
    },
    [dismiss],
  )

  return { toasts, notify, dismiss }
}

export type Notify = ReturnType<typeof useToasts>['notify']
