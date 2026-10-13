export interface TeacherOption {
  id: string
  name: string
}

export interface Subject {
  id: string
  name: string
}

export interface ClassSubject {
  id: string
  subject: Subject
  teacher: TeacherOption | null
}

export type DayId = 'mon' | 'tue' | 'wed' | 'thu' | 'fri'

export interface TimetablePeriod {
  id: string
  order: number
  label: string
  startTime: string
  endTime: string
  isBreak: boolean
}

export interface TimetableEntry {
  id: string
  periodId: string
  dayOfWeek: DayId
  subject: Subject
  teacher: TeacherOption
}
