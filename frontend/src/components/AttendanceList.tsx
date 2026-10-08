import type { ReactNode } from 'react'

interface AttendanceListProps {
  children: ReactNode
  /** When true (and `emptyMessage` is set), renders the empty-state row instead of `children`. */
  isEmpty?: boolean
  emptyMessage?: string
}

/**
 * Shared `<ul>` shell for attendance roster/entry lists. AttendancePage's editable roster and
 * MyAttendancePage's read-only entry list both render their own `<li>`s inside this same
 * container — only the container markup and empty-state row are identical in shape, so that's
 * all this extracts.
 */
export function AttendanceList({ children, isEmpty = false, emptyMessage }: AttendanceListProps) {
  return (
    <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {isEmpty && emptyMessage ? (
        <li className="px-4 py-6 text-center text-xs text-slate-400">{emptyMessage}</li>
      ) : (
        children
      )}
    </ul>
  )
}
