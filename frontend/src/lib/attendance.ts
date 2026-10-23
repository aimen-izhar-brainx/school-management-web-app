import type { AttendanceStatus } from '../data/attendance'
import { api, ApiError } from './http'

export interface AttendanceStudent {
  id: string
  name: string
  rollNumber: string
}

export interface AttendanceSection {
  id: string
  className: string
  sectionName: string
}

export function sectionLabel(section: Pick<AttendanceSection, 'className' | 'sectionName'>): string {
  return `${section.className} - ${section.sectionName}`
}

export interface AttendanceRecord {
  id: string
  studentId: string
  status: AttendanceStatus
}

export interface AttendanceSession {
  id: string
  sectionId: string
  date: string
  submittedAt: string
  submittedBy: { id: string; name: string }
  records: AttendanceRecord[]
}

export interface AttendanceAuditEntry {
  id: string
  recordId: string
  record: { studentId: string }
  oldStatus: AttendanceStatus
  newStatus: AttendanceStatus
  reason: string
  createdAt: string
  changedBy: { id: string; name: string }
}

export interface AttendanceTotals {
  present: number
  absent: number
  leave: number
  total: number
  /** Null when nothing is marked yet. */
  percentage: number | null
}

export interface StudentMonth {
  student?: { id: string; section: { id: string; name: string; schoolClass: { name: string } } | null }
  records: { id: string; date: string; status: AttendanceStatus }[]
  summary: AttendanceTotals
}

export interface DailySectionSummary {
  sectionId: string
  sectionName: string
  className: string
  enrolled: number
  marked: boolean
  present: number
  absent: number
  leave: number
}

export interface MonthlyStudentRow extends AttendanceTotals {
  studentId: string
  name: string
  rollNumber: string
}

export class AttendanceError extends Error {}

async function call<T>(action: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await action()
  } catch (cause) {
    throw new AttendanceError(cause instanceof ApiError ? cause.message : fallback)
  }
}

/** Sections the caller may mark or browse (admin: all, teacher: their own), without rosters. */
export const listSections = () =>
  call(() => api.get<AttendanceSection[]>('/attendance/sections'), 'Could not load classes.')

/** The current students of one section. */
export const getSectionRoster = (sectionId: string) =>
  call(
    () => api.get<AttendanceStudent[]>(`/attendance/sections/${encodeURIComponent(sectionId)}/students`),
    'Could not load the class roster.',
  )

/** The submitted attendance for a section and day, or null if it has not been marked. */
export const getSectionDay = (sectionId: string, date: string) =>
  call(
    () => api.get<AttendanceSession | null>(`/attendance?sectionId=${encodeURIComponent(sectionId)}&date=${date}`),
    'Could not load attendance.',
  )

export const submitAttendance = (sectionId: string, date: string, records: Record<string, AttendanceStatus>) =>
  call(
    () =>
      api.post<AttendanceSession>('/attendance', {
        sectionId,
        date,
        records: Object.entries(records).map(([studentId, status]) => ({ studentId, status })),
      }),
    'Could not submit attendance.',
  )

export const correctRecord = (recordId: string, status: AttendanceStatus, reason: string) =>
  call(
    () => api.patch<AttendanceRecord>(`/attendance/records/${encodeURIComponent(recordId)}`, { status, reason }),
    'Could not save the correction.',
  )

export const getAuditForDay = (sectionId: string, date: string) =>
  call(
    () =>
      api.get<AttendanceAuditEntry[]>(`/attendance/audit?sectionId=${encodeURIComponent(sectionId)}&date=${date}`),
    'Could not load the edit log.',
  )

export const getDailySummary = (date: string) =>
  call(() => api.get<DailySectionSummary[]>(`/attendance/summary?date=${date}`), 'Could not load the summary.')

export const getMonthlyForSection = (sectionId: string, month: string) =>
  call(
    () => api.get<MonthlyStudentRow[]>(`/attendance/sections/${encodeURIComponent(sectionId)}/monthly?month=${month}`),
    'Could not load the monthly report.',
  )

/** The signed-in student's own month. */
export const getMyMonth = (month: string) =>
  call(() => api.get<StudentMonth>(`/attendance/me?month=${month}`), 'Could not load your attendance.')
