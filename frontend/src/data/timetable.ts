export type DayId = 'mon' | 'tue' | 'wed' | 'thu' | 'fri'

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

export interface Period {
  id: string
  startTime: string
  endTime: string
  isBreak?: boolean
  breakLabel?: string
}

export const DEFAULT_PERIODS: Period[] = [
  { id: 'p1', startTime: '08:00', endTime: '08:45' },
  { id: 'p2', startTime: '08:45', endTime: '09:30' },
  { id: 'p3', startTime: '09:30', endTime: '10:15' },
  { id: 'break-1', startTime: '10:15', endTime: '10:30', isBreak: true, breakLabel: 'Recess' },
  { id: 'p4', startTime: '10:30', endTime: '11:15' },
  { id: 'p5', startTime: '11:15', endTime: '12:00' },
  { id: 'lunch', startTime: '12:00', endTime: '12:45', isBreak: true, breakLabel: 'Lunch' },
  { id: 'p6', startTime: '12:45', endTime: '13:30' },
  { id: 'p7', startTime: '13:30', endTime: '14:15' },
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

export function teacherName(id: string | null): string | null {
  return TEACHERS.find((teacher) => teacher.id === id)?.name ?? null
}

export const SUBJECTS = [
  'Mathematics',
  'English',
  'Science',
  'Social Studies',
  'Art',
  'Physical Education',
  'Computer Science',
  'Music',
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

export interface TimetableCell {
  subject: string
  teacherId: string
}

/** Keyed by period id, then day id. A missing entry means the slot is free. */
export type TimetableGrid = Partial<Record<string, Partial<Record<DayId, TimetableCell>>>>

/** Seed data keyed by section id, so the admin builder and the read-only views start in sync. */
export const INITIAL_TIMETABLES: Record<string, TimetableGrid> = {
  'grade5-a': {
    p1: {
      mon: { subject: 'Mathematics', teacherId: 't2' },
      tue: { subject: 'English', teacherId: 't5' },
      wed: { subject: 'Mathematics', teacherId: 't2' },
      thu: { subject: 'Science', teacherId: 't4' },
      fri: { subject: 'English', teacherId: 't5' },
    },
    p2: {
      mon: { subject: 'English', teacherId: 't5' },
      tue: { subject: 'Mathematics', teacherId: 't2' },
      wed: { subject: 'Science', teacherId: 't4' },
      thu: { subject: 'Mathematics', teacherId: 't2' },
      fri: { subject: 'Art', teacherId: 't1' },
    },
    p3: {
      mon: { subject: 'Science', teacherId: 't4' },
      wed: { subject: 'English', teacherId: 't5' },
      thu: { subject: 'Computer Science', teacherId: 't3' },
      fri: { subject: 'Mathematics', teacherId: 't2' },
    },
    p4: {
      mon: { subject: 'Social Studies', teacherId: 't1' },
      tue: { subject: 'Computer Science', teacherId: 't3' },
      wed: { subject: 'Social Studies', teacherId: 't1' },
      thu: { subject: 'English', teacherId: 't5' },
    },
    p5: {
      tue: { subject: 'Physical Education', teacherId: 't4' },
      wed: { subject: 'Music', teacherId: 't1' },
      fri: { subject: 'Social Studies', teacherId: 't1' },
    },
    p6: {
      mon: { subject: 'Physical Education', teacherId: 't4' },
      thu: { subject: 'Art', teacherId: 't1' },
    },
  },
  'grade5-b': {
    p1: {
      mon: { subject: 'Science', teacherId: 't4' },
      tue: { subject: 'Mathematics', teacherId: 't2' },
    },
  },
  'grade6-a': {
    p1: {
      mon: { subject: 'Mathematics', teacherId: 't2' },
      tue: { subject: 'Science', teacherId: 't4' },
    },
    p2: {
      mon: { subject: 'Computer Science', teacherId: 't3' },
    },
  },
}
