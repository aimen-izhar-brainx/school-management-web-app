import { sectionLabel, type AttendanceSection } from '../lib/attendance'

/** Shared input styling: 8px radius, neutral border, brand-neutral focus ring. */
export const fieldClass =
  'mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-500'

export const fieldErrorClass = 'border-red-600 focus:border-red-600 focus:ring-red-600/20'

/** The single primary (brand-filled) button style, and its secondary / destructive siblings. */
export const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50'
export const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 ease-out hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
export const destructiveButton =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition-colors duration-150 ease-out hover:bg-red-50'

/** Square icon-only action buttons; always pair with an aria-label and title. */
export const iconButton =
  'inline-flex size-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition-colors duration-150 ease-out hover:bg-slate-50'
export const destructiveIconButton =
  'inline-flex size-9 items-center justify-center rounded-lg border border-red-300 text-red-700 transition-colors duration-150 ease-out hover:bg-red-50'

export function sectionName(sections: AttendanceSection[], sectionId: string): string {
  const section = sections.find((option) => option.id === sectionId)
  return section ? sectionLabel(section) : sectionId
}

export type MarkingStatus = 'none' | 'partial' | 'complete'

export function markingStatus(entered: number, total: number): MarkingStatus {
  if (total > 0 && entered >= total) return 'complete'
  return entered > 0 ? 'partial' : 'none'
}
