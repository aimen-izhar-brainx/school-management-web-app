import { api, ApiError } from './http'

export interface Paginated<T> {
  data: T[]
  meta: { page: number; limit: number; total: number }
}

interface AccountUser {
  id: string
  name: string
  email: string
}

export interface Teacher {
  id: string
  employeeId: string
  subject: string
  gender: string | null
  phone: string | null
  dateOfBirth: string | null
  address: string | null
  qualification: string | null
  joinedAt: string | null
  user: AccountUser
}

export interface Student {
  id: string
  rollNumber: string
  section: { id: string; name: string; schoolClass: { id: string; name: string } } | null
  gender: string | null
  guardianName: string
  guardianPhone: string
  dateOfBirth: string | null
  address: string | null
  user: AccountUser
}

export interface CreateTeacherInput {
  name: string
  email: string
  password: string
  employeeId: string
  subject: string
  gender?: string
  phone?: string
  address?: string
  joinedAt?: string
}

export interface CreateStudentInput {
  name: string
  email: string
  password: string
  rollNumber: string
  guardianName: string
  guardianPhone: string
  sectionId?: string
  gender?: string
  dateOfBirth?: string
  address?: string
}

export type PersonTab = 'teacher' | 'student' | 'parent'
export type DirectoryTab = 'teacher' | 'student'

export class PeopleError extends Error {}

function withoutBlanks<T extends object>(input: T): T {
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      .filter(([, value]) => value !== ''),
  ) as T
}

async function call<T>(action: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await action()
  } catch (cause) {
    throw new PeopleError(cause instanceof ApiError ? cause.message : fallback)
  }
}

const listQuery = (page: number, limit: number) => `?page=${page}&limit=${limit}`

export const listTeachers = (page = 1, limit = 20) =>
  call(() => api.get<Paginated<Teacher>>(`/teachers${listQuery(page, limit)}`), 'Could not load teachers.')

export const createTeacher = (input: CreateTeacherInput) =>
  call(() => api.post<Teacher>('/teachers', withoutBlanks(input)), 'Could not create the teacher.')

export const deleteTeacher = (id: string) =>
  call(() => api.delete(`/teachers/${encodeURIComponent(id)}`), 'Could not delete the teacher.')

export const listStudents = (page = 1, limit = 20) =>
  call(() => api.get<Paginated<Student>>(`/students${listQuery(page, limit)}`), 'Could not load students.')

export const createStudent = (input: CreateStudentInput) =>
  call(() => api.post<Student>('/students', withoutBlanks(input)), 'Could not create the student.')

export const deleteStudent = (id: string) =>
  call(() => api.delete(`/students/${encodeURIComponent(id)}`), 'Could not delete the student.')
