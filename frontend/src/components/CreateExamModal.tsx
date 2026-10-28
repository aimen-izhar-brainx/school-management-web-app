import { CircleAlert, LoaderCircle } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import type { Exam } from '../data/exams'
import { sectionLabel } from '../lib/attendance'
import { createExam, updateExam, type ExamSection } from '../lib/exams'
import { fieldClass, fieldErrorClass, primaryButton, secondaryButton } from './examStyles'
import { Overlay } from './Overlay'

interface CreateExamModalProps {
  exams: Exam[]
  sections: ExamSection[]
  /** When set, the modal edits this exam; class and subject stay fixed. */
  editing?: Exam
  onClose: () => void
  onCreated: (exam: Exam) => void
  onError: (message: string) => void
}

type FieldName = 'name' | 'sectionId' | 'subject' | 'date' | 'totalMarks'
type Values = Record<FieldName, string>

const INITIAL: Values = { name: '', sectionId: '', subject: '', date: '', totalMarks: '100' }

function validate(field: FieldName, values: Values, exams: Exam[], editingId?: string): string | null {
  switch (field) {
    case 'name':
      if (!values.name.trim()) return 'Enter an exam name, for example “Term 1 Midterm”.'
      if (exams.some((e) => e.id !== editingId && e.sectionId === values.sectionId && e.subject === values.subject && e.name === values.name.trim())) {
        return 'This exam already exists for that class and subject. Change the name, class or subject.'
      }
      return null
    case 'sectionId':
      return values.sectionId ? null : 'Choose the class taking this exam.'
    case 'subject':
      return values.subject ? null : 'Choose the subject being examined.'
    case 'date':
      return values.date ? null : 'Pick the exam date.'
    case 'totalMarks': {
      const total = Number(values.totalMarks)
      return Number.isInteger(total) && total > 0 ? null : 'Enter total marks as a whole number above 0, for example 100.'
    }
  }
}

const FIELDS: FieldName[] = ['name', 'sectionId', 'subject', 'date', 'totalMarks']

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label} <span className="font-normal text-slate-600">*</span>
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 flex items-start gap-1 text-xs text-red-700">
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}

/** Focused single-record form. Fields validate when the user leaves them, not on every keystroke. */
export function CreateExamModal({ exams, sections, editing, onClose, onCreated, onError }: CreateExamModalProps) {
  const initial: Values = editing
    ? { name: editing.name, sectionId: editing.sectionId, subject: editing.subject, date: editing.date, totalMarks: String(editing.totalMarks) }
    : INITIAL
  const [values, setValues] = useState<Values>(initial)
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [submitting, setSubmitting] = useState(false)

  const dirty = FIELDS.some((field) => values[field] !== initial[field])

  const subjects = sections.find((section) => section.id === values.sectionId)?.subjects ?? []

  // Changing the class clears the subject, since each class teaches its own set.
  const set = (field: FieldName, value: string) =>
    setValues((current) => ({ ...current, [field]: value, ...(field === 'sectionId' ? { subject: '' } : {}) }))
  const blur = (field: FieldName) => setErrors((current) => ({ ...current, [field]: validate(field, values, exams, editing?.id) ?? undefined }))

  const props = (field: FieldName) => ({
    id: `exam-${field}`,
    value: values[field],
    onChange: (event: { target: { value: string } }) => set(field, event.target.value),
    onBlur: () => blur(field),
    'aria-invalid': Boolean(errors[field]),
    'aria-describedby': errors[field] ? `exam-${field}-error` : undefined,
    className: `${fieldClass} ${errors[field] ? fieldErrorClass : ''}`,
  })

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const found: Partial<Record<FieldName, string>> = {}
    for (const field of FIELDS) {
      const problem = validate(field, values, exams, editing?.id)
      if (problem) found[field] = problem
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setSubmitting(true)
    try {
      const input = { ...values, name: values.name.trim(), totalMarks: Number(values.totalMarks) }
      onCreated(editing ? await updateExam(editing.id, input) : await createExam(input))
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'The exam could not be created. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <Overlay
      variant="modal"
      size="md"
      title={editing ? 'Edit exam' : 'Create exam'}
      description={
        editing
          ? 'Change the name, date or total marks. The class and subject cannot be changed.'
          : 'Schedule an exam for one class and subject. You can enter marks once it is created.'
      }
      dirty={dirty && !submitting}
      onClose={onClose}
      footer={(requestClose) => (
        <div className="flex justify-end gap-3">
          <button type="button" onClick={requestClose} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" form="create-exam-form" disabled={submitting} className={primaryButton}>
            {submitting && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            {editing ? (submitting ? 'Saving…' : 'Save changes') : submitting ? 'Creating…' : 'Create exam'}
          </button>
        </div>
      )}
    >
      <form id="create-exam-form" onSubmit={handleSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field id="exam-name" label="Exam name" error={errors.name}>
            <input {...props('name')} placeholder="e.g. Term 1 Midterm" />
          </Field>
        </div>
        <Field id="exam-sectionId" label="Class" error={errors.sectionId}>
          <select {...props('sectionId')} disabled={Boolean(editing)}>
            <option value="">Select a class</option>
            {sections.map((option) => (
              <option key={option.id} value={option.id}>
                {sectionLabel(option)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="exam-subject" label="Subject" error={errors.subject}>
          <select {...props('subject')} disabled={Boolean(editing) || !values.sectionId || subjects.length === 0}>
            <option value="">
              {values.sectionId && subjects.length === 0 ? 'No subjects assigned to this class' : 'Select a subject'}
            </option>
            {subjects.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field id="exam-date" label="Date" error={errors.date}>
          <input {...props('date')} type="date" />
        </Field>
        <Field id="exam-totalMarks" label="Total marks" error={errors.totalMarks}>
          <input {...props('totalMarks')} type="number" min={1} inputMode="numeric" />
        </Field>
      </form>
    </Overlay>
  )
}
