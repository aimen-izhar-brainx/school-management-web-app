import { ClipboardList, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { buildReportCard, rosterFor } from '../data/exams'
import { sectionLabel } from '../lib/attendance'
import { getSectionMarks, type SectionMarks } from '../lib/exams'
import { fieldClass } from './examStyles'
import { EmptyState } from './examUi'
import { ReportCard } from './ReportCard'
import type { ExamData } from './useExamData'

/** Pick class → exam → student, then review and print that student's report card. */
export function ReportCardsTab({ data }: { data: ExamData }) {
  const [sectionId, setSectionId] = useState(data.sections[0]?.id ?? '')
  // Tagged with its class so a slow response for a previous class is never shown for the current one.
  const [loaded, setLoaded] = useState<{ sectionId: string; sheet: SectionMarks | null } | null>(null)
  const [examName, setExamName] = useState('')
  const [studentId, setStudentId] = useState('')

  useEffect(() => {
    let live = true
    if (sectionId) {
      getSectionMarks(sectionId)
        .then((sheet) => live && setLoaded({ sectionId, sheet }))
        .catch(() => live && setLoaded({ sectionId, sheet: null }))
    }
    return () => {
      live = false
    }
  }, [sectionId])

  const current = loaded?.sectionId === sectionId ? loaded : null
  const sheet = current?.sheet ?? null
  const failed = current !== null && current.sheet === null

  const names = [...new Set(data.exams.filter((exam) => exam.sectionId === sectionId).map((exam) => exam.name))]
  const activeName = names.includes(examName) ? examName : (names[0] ?? '')
  const students = sheet ? rosterFor(sheet.roster, sectionId) : []
  const student = students.find((s) => s.id === studentId)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="rc-class" className="block text-sm font-medium text-slate-800">
            Class
          </label>
          <select
            id="rc-class"
            value={sectionId}
            onChange={(event) => {
              setSectionId(event.target.value)
              setStudentId('')
            }}
            className={fieldClass}
          >
            {data.sections.map((option) => (
              <option key={option.id} value={option.id}>
                {sectionLabel(option)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rc-exam" className="block text-sm font-medium text-slate-800">
            Exam
          </label>
          <select id="rc-exam" value={activeName} onChange={(event) => setExamName(event.target.value)} disabled={names.length === 0} className={fieldClass}>
            {names.length === 0 && <option value="">No exams for this class</option>}
            {names.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rc-student" className="block text-sm font-medium text-slate-800">
            Student
          </label>
          <select id="rc-student" value={studentId} onChange={(event) => setStudentId(event.target.value)} disabled={!sheet} className={fieldClass}>
            <option value="">{sheet ? 'Select a student' : 'Loading…'}</option>
            {students.map((option) => (
              <option key={option.id} value={option.id}>
                {option.rollNo}. {option.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {failed ? (
        <p role="alert" className="text-sm text-red-700">
          Could not load this class&rsquo;s marks. Try another class or reload.
        </p>
      ) : names.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No exams for this class yet">
          Create an exam for this class and enter marks to generate report cards.
        </EmptyState>
      ) : sheet && student && activeName ? (
        <ReportCard card={buildReportCard(student, activeName, data.exams, sheet.marks, data.scale)} />
      ) : (
        <EmptyState icon={UserRound} title="Choose a student">
          Pick a student above to see their report card for {activeName}.
        </EmptyState>
      )}
    </div>
  )
}
