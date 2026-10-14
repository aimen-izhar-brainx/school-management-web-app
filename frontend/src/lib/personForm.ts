import type { Person } from './types'

export interface PersonFormValues {
  name: string
  email: string
  phone: string
  gender: string
  address: string
  // teacher
  employeeId: string
  department: string
  joiningDate: string
  // student
  dateOfBirth: string
  admissionDate: string
  rollNumber: string
  sectionId: string
  parentId: string
  // parent
  relationship: string
  studentIds: string[]
}

export const emptyPersonForm: PersonFormValues = {
  name: '',
  email: '',
  phone: '',
  gender: '',
  address: '',
  employeeId: '',
  department: '',
  joiningDate: '',
  dateOfBirth: '',
  admissionDate: '',
  rollNumber: '',
  sectionId: '',
  parentId: '',
  relationship: '',
  studentIds: [],
}

export function formFromPerson(person: Person): PersonFormValues {
  return {
    name: person.name,
    email: person.email,
    phone: person.phone ?? '',
    gender: person.gender ?? '',
    address: person.address ?? '',
    employeeId: person.employeeId ?? '',
    department: person.department ?? '',
    joiningDate: person.joiningDate ?? '',
    dateOfBirth: person.dateOfBirth ?? '',
    admissionDate: person.admissionDate ?? '',
    rollNumber: person.rollNumber ?? '',
    sectionId: person.sectionId ?? '',
    parentId: person.parent?.id ?? '',
    relationship: person.relationship ?? '',
    studentIds: person.children.map((child) => child.id),
  }
}
