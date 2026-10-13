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

export interface TeacherTimetableEntry {
  id: string
  periodId: string
  dayOfWeek: DayId
  subject: Subject
  section: { id: string; name: string }
  class: { id: string; name: string }
}

export interface StudentTimetableEntry {
  id: string
  periodId: string
  dayOfWeek: DayId
  subject: Subject
  teacher: TeacherOption
}

/** Response of `GET /timetable/me`: a teacher's combined schedule or a student's section schedule. */
export type MyTimetable =
  | { kind: 'teacher'; periods: TimetablePeriod[]; entries: TeacherTimetableEntry[] }
  | {
      kind: 'student'
      section: { id: string; name: string; className: string } | null
      periods: TimetablePeriod[]
      entries: StudentTimetableEntry[]
    }
