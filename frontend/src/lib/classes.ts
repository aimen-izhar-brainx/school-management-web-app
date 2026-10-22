import { api, ApiError } from './http'

interface TeacherRef {
  id: string
  user: { name: string }
}

export interface ApiSection {
  id: string
  name: string
  classTeacherId: string | null
  students: { id: string; rollNumber: string; user: { name: string } }[]
}

export interface ApiSubject {
  id: string
  subject: string
  teacherId: string | null
}

export interface ApiClass {
  id: string
  name: string
  sections: ApiSection[]
  subjects: ApiSubject[]
}

export interface TeacherOption {
  id: string
  name: string
}

export class ClassesError extends Error {}

async function call<T>(action: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await action()
  } catch (cause) {
    throw new ClassesError(cause instanceof ApiError ? cause.message : fallback)
  }
}

const enc = encodeURIComponent

export const listClasses = () => call(() => api.get<ApiClass[]>('/classes'), 'Could not load classes.')

export const createClass = (name: string) =>
  call(() => api.post<ApiClass>('/classes', { name }), 'Could not create the class.')

export const renameClass = (id: string, name: string) =>
  call(() => api.patch<ApiClass>(`/classes/${enc(id)}`, { name }), 'Could not rename the class.')

export const deleteClass = (id: string) =>
  call(() => api.delete(`/classes/${enc(id)}`), 'Could not delete the class.')

export const addSection = (classId: string, name: string) =>
  call(() => api.post<ApiSection>(`/classes/${enc(classId)}/sections`, { name }), 'Could not add the section.')

export const setSectionTeacher = (sectionId: string, classTeacherId: string | null) =>
  call(
    () => api.patch<ApiSection>(`/classes/sections/${enc(sectionId)}`, { classTeacherId }),
    'Could not assign the class teacher.',
  )

export const deleteSection = (sectionId: string) =>
  call(() => api.delete(`/classes/sections/${enc(sectionId)}`), 'Could not remove the section.')

export const upsertSubject = (classId: string, subject: string, teacherId: string | null) =>
  call(
    () => api.put<ApiSubject>(`/classes/${enc(classId)}/subjects`, { subject, ...(teacherId ? { teacherId } : {}) }),
    'Could not save the subject.',
  )

export const removeSubject = (classId: string, subject: string) =>
  call(() => api.delete(`/classes/${enc(classId)}/subjects/${enc(subject)}`), 'Could not remove the subject.')

/** Teachers available for assignment (first page of up to 100). */
export const listTeacherOptions = () =>
  call(
    () => api.get<{ data: TeacherRef[] }>('/teachers?page=1&limit=100'),
    'Could not load teachers.',
  ).then((result) => result.data.map((teacher): TeacherOption => ({ id: teacher.id, name: teacher.user.name })))
