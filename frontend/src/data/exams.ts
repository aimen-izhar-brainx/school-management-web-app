export interface Exam {
  id: string
  name: string
  sectionId: string
  subject: string
  /** yyyy-mm-dd */
  date: string
  totalMarks: number
  /** Students with a mark entered. */
  markCount: number
  /** Students in the exam's class. */
  studentCount: number
}

export interface RosterStudent {
  id: string
  name: string
  rollNo: string
  sectionId: string
}

/** marks[examId][studentId] — a missing entry means "not entered yet". */
export type MarksBook = Record<string, Record<string, number>>

export interface GradeBand {
  grade: string
  /** Lowest percentage that earns this grade. */
  minPercent: number
}

/** The lowest band is the failing grade; its minimum is always 0. */
export const DEFAULT_GRADE_SCALE: GradeBand[] = [
  { grade: 'A', minPercent: 80 },
  { grade: 'B', minPercent: 70 },
  { grade: 'C', minPercent: 60 },
  { grade: 'D', minPercent: 50 },
  { grade: 'F', minPercent: 0 },
]

/** Students of one section in roll-number order. */
export function rosterFor(roster: RosterStudent[], sectionId: string): RosterStudent[] {
  return roster
    .filter((student) => student.sectionId === sectionId)
    .sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }))
}

/** Grade for a percentage; bands may be in any order. */
export function gradeFor(percent: number, scale: GradeBand[]): string {
  const sorted = [...scale].sort((a, b) => b.minPercent - a.minPercent)
  return (sorted.find((band) => percent >= band.minPercent) ?? sorted[sorted.length - 1]).grade
}

export function failingGrade(scale: GradeBand[]): string {
  return [...scale].sort((a, b) => a.minPercent - b.minPercent)[0].grade
}

export function percentOf(marks: number, total: number): number {
  return total > 0 ? Math.round((marks / total) * 1000) / 10 : 0
}

/** Returns an error message for an invalid scale, or null when it is valid. */
export function validateScale(scale: GradeBand[]): string | null {
  const sorted = [...scale].sort((a, b) => b.minPercent - a.minPercent)
  if (sorted.some((band) => !Number.isFinite(band.minPercent) || band.minPercent < 0 || band.minPercent > 100)) {
    return 'Each minimum must be a percentage between 0 and 100.'
  }
  if (sorted[sorted.length - 1].minPercent !== 0) return 'The lowest grade must start at 0%.'
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minPercent === sorted[i - 1].minPercent) return 'Two grades cannot share the same minimum.'
  }
  return null
}

export interface ReportRow {
  examId: string
  subject: string
  date: string
  marks: number | null
  total: number
  percent: number | null
  grade: string | null
}

export interface ReportCardData {
  student: RosterStudent
  examName: string
  rows: ReportRow[]
  obtained: number
  total: number
  percent: number | null
  grade: string | null
  /** null while any subject still has no marks. */
  result: 'Pass' | 'Fail' | null
}

/** Builds one student's report card for every exam in their section that shares `examName`. */
export function buildReportCard(
  student: RosterStudent,
  examName: string,
  exams: Exam[],
  marks: MarksBook,
  scale: GradeBand[],
): ReportCardData {
  const rows: ReportRow[] = exams
    .filter((exam) => exam.sectionId === student.sectionId && exam.name === examName)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((exam) => {
      const got = marks[exam.id]?.[student.id]
      const percent = got === undefined ? null : percentOf(got, exam.totalMarks)
      return {
        examId: exam.id,
        subject: exam.subject,
        date: exam.date,
        marks: got ?? null,
        total: exam.totalMarks,
        percent,
        grade: percent === null ? null : gradeFor(percent, scale),
      }
    })

  const entered = rows.filter((row) => row.marks !== null)
  const obtained = entered.reduce((sum, row) => sum + (row.marks ?? 0), 0)
  const total = entered.reduce((sum, row) => sum + row.total, 0)
  const percent = total > 0 ? percentOf(obtained, total) : null
  const complete = rows.length > 0 && entered.length === rows.length
  const failed = failingGrade(scale)

  return {
    student,
    examName,
    rows,
    obtained,
    total,
    percent,
    grade: percent === null ? null : gradeFor(percent, scale),
    result: complete ? (rows.some((row) => row.grade === failed) ? 'Fail' : 'Pass') : null,
  }
}

export function formatExamDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
