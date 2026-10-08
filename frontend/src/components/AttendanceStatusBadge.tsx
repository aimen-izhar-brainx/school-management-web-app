import type { ReactNode } from 'react'
import { statusInfo, type AttendanceStatus } from '../data/attendance'

interface AttendanceStatusBadgeProps {
  status: AttendanceStatus
  /** Shows the small color dot used by the daily-summary count badges (off by default for label-only badges). */
  dot?: boolean
  /** Overrides the default status label — e.g. a count, for the dot-style summary badges. */
  children?: ReactNode
}

/**
 * Shared status pill for a student's/summary's attendance status, so badge styling (color
 * classes, dot indicator) never drifts between AttendancePage and MyAttendancePage.
 */
export function AttendanceStatusBadge({ status, dot = false, children }: AttendanceStatusBadgeProps) {
  const info = statusInfo(status)

  if (dot) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${info.badgeClass}`}
      >
        <span className={`size-1.5 rounded-full ${info.dotClass}`} />
        {children ?? info.label}
      </span>
    )
  }

  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${info.badgeClass}`}>
      {children ?? info.label}
    </span>
  )
}
