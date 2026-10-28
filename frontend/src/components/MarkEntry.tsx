import { CircleAlert, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { failingGrade, formatExamDate, gradeFor, percentOf, rosterFor, type Exam, type GradeBand, type RosterStudent } from '../data/exams'
import { saveMarks } from '../lib/exams'
import type { AttendanceSection } from '../lib/attendance'
import { fieldErrorClass, primaryButton, secondaryButton, sectionName } from './examStyles'
import { Overlay } from './Overlay'
import type { Notify } from './useToasts'

interface MarkEntryProps {
  exam: Exam
  sections: AttendanceSection[]
  roster: RosterStudent[]
  marks: Record<string, number>
  scale: GradeBand[]
  /** Only teachers enter marks; admins, and teachers opening "View marks", get a read-only drawer. */
  canEdit: boolean
  onSaved: () => void
  onClose: () => void
  notify: Notify
}

function problemWith(raw: string, total: number): string | null {
  if (raw.trim() === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return 'Enter 0 or more.'
  if (value > total) return `Max is ${total}.`
  return null
}

/** Marks for one exam in a side drawer, so the exam list stays visible behind it. */
export function MarkEntry({ exam, sections, roster, marks, scale, canEdit, onSaved, onClose, notify }: MarkEntryProps) {
  const students = rosterFor(roster, exam.sectionId)
  const initial = Object.fromEntries(students.map((student) => [student.id, marks[student.id] === undefined ? '' : String(marks[student.id])]))
  const [draft, setDraft] = useState<Record<string, string>>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const dirty = students.some((student) => draft[student.id] !== initial[student.id])
  const entered = students.filter((student) => draft[student.id].trim() !== '').length
  const failed = failingGrade(scale)

  const checkRow = (studentId: string) =>
    setErrors((current) => {
      const { [studentId]: _cleared, ...rest } = current
      const problem = problemWith(draft[studentId], exam.totalMarks)
      return problem ? { ...rest, [studentId]: problem } : rest
    })

  const handleSave = async () => {
    const found: Record<string, string> = {}
    const entries: Record<string, number> = {}
    for (const student of students) {
      const raw = draft[student.id].trim()
      if (raw === '') continue
      const problem = problemWith(raw, exam.totalMarks)
      if (problem) found[student.id] = problem
      else entries[student.id] = Number(raw)
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      await saveMarks(exam.id, entries)
      notify('success', `Marks saved for ${exam.subject} · ${exam.name}.`)
      onSaved()
      onClose()
    } catch {
      notify('error', 'Marks could not be saved. Your entries are still here, so try again.')
      setSaving(false)
    }
  }

  return (
    <Overlay
      variant="drawer"
      title={`${exam.subject} · ${exam.name}`}
      description={`${sectionName(sections, exam.sectionId)} · ${formatExamDate(exam.date)} · Out of ${exam.totalMarks}`}
      dirty={canEdit && dirty && !saving}
      onClose={onClose}
      footer={(requestClose) =>
        canEdit ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              {entered} of {students.length} marked
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={requestClose} className={secondaryButton}>
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving || !dirty} className={primaryButton}>
                {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                {saving ? 'Saving…' : 'Save marks'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-600">View only.</p>
            <button type="button" onClick={requestClose} className={secondaryButton}>
              Close
            </button>
          </div>
        )
      }
    >
      {students.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-600">No students are enrolled in this class yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-slate-200 text-xs text-slate-600">
              <th scope="col" className="w-12 py-2 pr-2 font-medium">
                Roll
              </th>
              <th scope="col" className="py-2 font-medium">
                Student
              </th>
              <th scope="col" className="w-28 py-2 text-right font-medium">
                Marks
              </th>
              <th scope="col" className="w-20 py-2 pl-4 text-right font-medium">
                Grade
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((student) => {
              const raw = draft[student.id]
              const value = raw.trim() === '' ? null : Number(raw)
              const valid = value !== null && !problemWith(raw, exam.totalMarks)
              const grade = valid ? gradeFor(percentOf(value, exam.totalMarks), scale) : null
              const error = errors[student.id]
              return (
                <tr key={student.id} className="align-top">
                  <td className="py-3 pr-2 text-slate-600">{student.rollNo}</td>
                  <th scope="row" className="py-3 font-medium text-slate-900">
                    <label htmlFor={`marks-${student.id}`}>{student.name}</label>
                  </th>
                  <td className="py-2 text-right">
                    {canEdit ? (
                      <>
                        <input
                          id={`marks-${student.id}`}
                          type="number"
                          min={0}
                          max={exam.totalMarks}
                          inputMode="decimal"
                          value={raw}
                          onChange={(event) => setDraft({ ...draft, [student.id]: event.target.value })}
                          onBlur={() => checkRow(student.id)}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? `marks-${student.id}-error` : undefined}
                          className={`w-24 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${
                            error ? fieldErrorClass : ''
                          }`}
                        />
                        {error && (
                          <p id={`marks-${student.id}-error`} role="alert" className="mt-1 flex items-center justify-end gap-1 text-xs text-red-700">
                            <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                            {error}
                          </p>
                        )}
                      </>
                    ) : (
                      <span id={`marks-${student.id}`} className="block py-1 text-slate-900">
                        {raw === '' ? 'Pending' : `${raw} / ${exam.totalMarks}`}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pl-4 text-right font-semibold text-slate-900">
                    {grade === null ? (
                      <span className="font-normal text-slate-600">—</span>
                    ) : grade === failed ? (
                      <span className="inline-flex items-center gap-1 text-red-700">
                        <CircleAlert className="size-4" aria-hidden="true" />
                        {grade} <span className="text-xs font-normal">Fail</span>
                      </span>
                    ) : (
                      grade
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Overlay>
  )
}
