import {
  type Exam,
  type GradeBand,
  type MarksBook,
  type RosterStudent,
} from '../data/exams'
import type { AttendanceSection } from './attendance'
import { api, ApiError } from './http'

/** A section plus the subjects its class teaches. */
export interface ExamSection extends AttendanceSection {
  subjects: string[]
}

export interface ExamStore {
  scale: GradeBand[]
  exams: Exam[]
  sections: ExamSection[]
}

/** One class's roster and every mark entered for its exams. */
export interface SectionMarks {
  roster: RosterStudent[]
  marks: MarksBook
}

export interface ExamInput {
  name: string
  sectionId: string
  subject: string
  date: string
  totalMarks: number
}

export async function getExamData(): Promise<ExamStore> {
  const [exams, sections, scale] = await Promise.all([
    api.get<Exam[]>('/exams'),
    api.get<ExamSection[]>('/exams/sections'),
    api.get<GradeBand[]>('/exams/grade-scale'),
  ])
  return { scale, exams, sections }
}

/** Marks load per class, on demand, so the page never pulls the whole school's marks at once. */
export function getSectionMarks(sectionId: string): Promise<SectionMarks> {
  return api.get<SectionMarks>(`/exams/marks?sectionId=${encodeURIComponent(sectionId)}`)
}

export interface MyResults {
  student: RosterStudent
  exams: Exam[]
  scale: GradeBand[]
  /** Shaped as a marks book so it feeds buildReportCard directly. */
  marks: MarksBook
}

/** The signed-in student's own exams and marks. */
export async function getMyResults(): Promise<MyResults> {
  const [result, scale] = await Promise.all([
    api.get<{ student: RosterStudent; exams: Exam[]; marks: Record<string, number> }>('/exams/my-results'),
    api.get<GradeBand[]>('/exams/grade-scale'),
  ])
  const marks: MarksBook = {}
  for (const [examId, value] of Object.entries(result.marks)) marks[examId] = { [result.student.id]: value }
  return { student: result.student, exams: result.exams, marks, scale }
}

export class ExamError extends Error {}

export async function createExam(input: ExamInput): Promise<Exam> {
  try {
    return await api.post<Exam>('/exams', input)
  } catch (cause) {
    throw new ExamError(cause instanceof ApiError ? cause.message : 'The exam could not be created. Try again.')
  }
}

/** Class and subject are fixed once an exam exists; only these fields can change. */
export async function updateExam(examId: string, input: Pick<ExamInput, 'name' | 'date' | 'totalMarks'>): Promise<Exam> {
  try {
    return await api.patch<Exam>(`/exams/${encodeURIComponent(examId)}`, input)
  } catch (cause) {
    throw new ExamError(cause instanceof ApiError ? cause.message : 'The exam could not be updated. Try again.')
  }
}

/** Deletes the exam (and, by cascade, its marks) on the backend. */
export async function deleteExam(examId: string): Promise<void> {
  try {
    await api.delete(`/exams/${encodeURIComponent(examId)}`)
  } catch (cause) {
    throw new ExamError(cause instanceof ApiError ? cause.message : 'The exam could not be deleted. Try again.')
  }
}

/** Replaces the marks for one exam; students missing from `entries` are cleared. */
export async function saveMarks(examId: string, entries: Record<string, number>): Promise<void> {
  await api.put(`/exams/${encodeURIComponent(examId)}/marks`, { entries })
}

/** Replaces the school-wide grade scale; the backend returns it as stored. */
export async function saveGradeScale(scale: GradeBand[]): Promise<GradeBand[]> {
  try {
    return await api.put<GradeBand[]>('/exams/grade-scale', { scale })
  } catch (cause) {
    throw new ExamError(cause instanceof ApiError ? cause.message : 'The grading scale could not be saved. Try again.')
  }
}
