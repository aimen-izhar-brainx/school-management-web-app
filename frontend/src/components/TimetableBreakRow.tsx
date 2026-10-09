import { Coffee } from 'lucide-react'
import { DAYS, formatTime, type Period } from '../data/timetable'

interface TimetableBreakRowProps {
  period: Period
}

/** Shared full-width break row (amber background, coffee icon, time range) used by both TimetablePage and MyTimetablePage. */
export function TimetableBreakRow({ period }: TimetableBreakRowProps) {
  return (
    <tr className="border-b border-slate-200 bg-amber-50/60">
      <td colSpan={DAYS.length + 1} className="px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-amber-700">
          <Coffee className="size-3.5" />
          {period.breakLabel ?? 'Break'} &middot; {formatTime(period.startTime)} &ndash; {formatTime(period.endTime)}
        </div>
      </td>
    </tr>
  )
}
