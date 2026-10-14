import { CircleCheck } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import { type PersonFormValues } from '../lib/personForm'
import type { PersonRole } from '../lib/types'
import { Input } from './Input'
import { Select, type SelectOption } from './Select'

const GENDERS = ['Male', 'Female', 'Other']
const RELATIONSHIPS = ['Father', 'Mother', 'Guardian']

const NOUN: Record<PersonRole, string> = { teacher: 'teacher', student: 'student', parent: 'parent' }

interface PersonFormProps {
  role: PersonRole
  values: PersonFormValues
  onChange: (patch: Partial<PersonFormValues>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel?: () => void
  isEditing: boolean
  isSaving: boolean
  error: string | null
  notice: string | null
  sectionOptions: SelectOption[]
  parentOptions: SelectOption[]
  studentOptions: { id: string; name: string }[]
}

/** Create/edit form for one person; the fields shown depend on the role. */
export function PersonForm({
  role,
  values,
  onChange,
  onSubmit,
  onCancel,
  isEditing,
  isSaving,
  error,
  notice,
  sectionOptions,
  parentOptions,
  studentOptions,
}: PersonFormProps) {
  const id = (field: string) => `${role}-${field}`
  const text = (field: keyof PersonFormValues & string, label: string, extra: Partial<Parameters<typeof Input>[0]> = {}): ReactNode => (
    <Input
      id={id(field)}
      label={label}
      value={values[field] as string}
      onChange={(value) => onChange({ [field]: value })}
      {...extra}
    />
  )

  const toggleStudent = (studentId: string) =>
    onChange({
      studentIds: values.studentIds.includes(studentId)
        ? values.studentIds.filter((existing) => existing !== studentId)
        : [...values.studentIds, studentId],
    })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h2 className="text-xl font-bold text-slate-900">
        {isEditing ? `Edit ${NOUN[role]}` : `Add ${NOUN[role]}`}
      </h2>
      {!isEditing && (
        <p className="text-sm text-slate-500">They&rsquo;ll get an email invite to set their password.</p>
      )}

      {text('name', 'Full name', { autoComplete: 'name' })}
      {text('email', 'Email address', { type: 'email', autoComplete: 'email' })}
      {text('phone', 'Phone number', { type: 'tel', autoComplete: 'tel', placeholder: '+1 (555) 123-4567' })}

      {role === 'teacher' && (
        <>
          {text('employeeId', 'Employee ID')}
          {text('department', 'Subject / Department', { placeholder: 'e.g. Mathematics' })}
          {text('joiningDate', 'Joining date', { type: 'date' })}
        </>
      )}

      {role === 'student' && (
        <>
          {text('dateOfBirth', 'Date of birth', { type: 'date' })}
          <Select
            id={id('section')}
            label="Class / Section"
            value={values.sectionId}
            onChange={(value) => onChange({ sectionId: value })}
            options={sectionOptions}
          />
          {text('rollNumber', 'Roll number')}
          {text('admissionDate', 'Admission date', { type: 'date' })}
          <Select
            id={id('parent')}
            label="Parent / Guardian"
            value={values.parentId}
            onChange={(value) => onChange({ parentId: value })}
            options={parentOptions}
          />
        </>
      )}

      {role === 'parent' && (
        <>
          <Select
            id={id('relationship')}
            label="Relationship to student"
            value={values.relationship}
            onChange={(value) => onChange({ relationship: value })}
            options={RELATIONSHIPS}
          />
          <fieldset>
            <legend className="block text-sm font-medium text-slate-700">Linked students</legend>
            {studentOptions.length === 0 ? (
              <p className="mt-1.5 text-sm text-slate-500">No students yet.</p>
            ) : (
              <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-300 p-2">
                {studentOptions.map((student) => (
                  <li key={student.id}>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={values.studentIds.includes(student.id)}
                        onChange={() => toggleStudent(student.id)}
                      />
                      {student.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        </>
      )}

      <Select
        id={id('gender')}
        label="Gender"
        value={values.gender}
        onChange={(value) => onChange({ gender: value })}
        options={GENDERS}
      />
      <div>
        <label htmlFor={id('address')} className="block text-sm font-medium text-slate-700">
          Address
        </label>
        <textarea
          id={id('address')}
          name={id('address')}
          rows={2}
          value={values.address}
          onChange={(event) => onChange({ address: event.target.value })}
          className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-600">
          <CircleCheck className="size-4" />
          {notice}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSaving}
          className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-60"
        >
          {isEditing ? 'Save changes' : `Add ${NOUN[role]}`}
        </button>
        {isEditing && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
