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

export type PersonRole = 'teacher' | 'student' | 'parent'

/** A teacher, student or parent as returned by `/people`. Dates are `YYYY-MM-DD`. */
export interface Person {
  id: string
  name: string
  email: string
  role: PersonRole
  phone: string | null
  gender: string | null
  address: string | null
  employeeId: string | null
  department: string | null
  joiningDate: string | null
  dateOfBirth: string | null
  admissionDate: string | null
  rollNumber: string | null
  relationship: string | null
  sectionId: string | null
  section: { id: string; name: string; className: string } | null
  parent: { id: string; name: string } | null
  children: { id: string; name: string }[]
}

export interface Notice {
  id: string
  title: string
  description: string
  createdAt: string
  /** null = school-wide. */
  class: { id: string; name: string } | null
  postedBy: string
  postedByRole: 'admin' | 'teacher'
  canDelete: boolean
}
