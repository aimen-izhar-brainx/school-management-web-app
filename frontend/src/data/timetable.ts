import type { DayId } from '../lib/types'

export interface DayInfo {
  id: DayId
  label: string
  shortLabel: string
}

export const DAYS: DayInfo[] = [
  { id: 'mon', label: 'Monday', shortLabel: 'Mon' },
  { id: 'tue', label: 'Tuesday', shortLabel: 'Tue' },
  { id: 'wed', label: 'Wednesday', shortLabel: 'Wed' },
  { id: 'thu', label: 'Thursday', shortLabel: 'Thu' },
  { id: 'fri', label: 'Friday', shortLabel: 'Fri' },
]

export interface Teacher {
  id: string
  name: string
}

export const TEACHERS: Teacher[] = [
  { id: 't1', name: 'Grace Kim' },
  { id: 't2', name: 'Daniel Ortiz' },
  { id: 't3', name: 'Priya Nair' },
  { id: 't4', name: 'Marcus Webb' },
  { id: 't5', name: 'Sofia Rossi' },
]

export interface SectionOption {
  id: string
  className: string
  sectionName: string
}

export const SECTION_OPTIONS: SectionOption[] = [
  { id: 'grade5-a', className: 'Grade 5', sectionName: 'A' },
  { id: 'grade5-b', className: 'Grade 5', sectionName: 'B' },
  { id: 'grade6-a', className: 'Grade 6', sectionName: 'A' },
]

export function sectionLabel(section: SectionOption): string {
  return `${section.className} - ${section.sectionName}`
}

/** Formats a 24h "HH:mm" time string (e.g. "14:30") as "2:30 PM". */
export function formatTime(time: string): string {
  const [hourString, minute] = time.split(':')
  const hour = Number(hourString)
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${minute} ${period}`
}
