import { CircleAlert, CircleCheck, Clock, Printer } from 'lucide-react'
import { formatExamDate, type ReportCardData } from '../data/exams'
import { SECTION_OPTIONS, sectionLabel } from '../data/timetable'
import { primaryButton } from './examStyles'

interface ReportCardProps {
  card: ReportCardData
}

/**
 * One student's report card. The `report-card-print` wrapper is the only thing visible when the
 * browser prints (see index.css), so "Print / Save as PDF" produces a clean single page.
 */
export function ReportCard({ card }: ReportCardProps) {
  const section = SECTION_OPTIONS.find((option) => option.id === card.student.sectionId)

  return (
    <div>
      <div className="flex justify-end print:hidden">
        <button type="button" onClick={() => window.print()} className={primaryButton}>
          <Printer className="size-4" aria-hidden="true" />
          Print / Save as PDF
        </button>
      </div>

      <article className="report-card-print mt-4 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <header className="border-b border-slate-200 pb-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">Brainx School</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Report Card</h2>
          <p className="text-sm text-slate-600">{card.examName}</p>
        </header>

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-600">Student</dt>
            <dd className="font-semibold text-slate-900">{card.student.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-600">Class</dt>
            <dd className="font-semibold text-slate-900">{section ? sectionLabel(section) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-600">Roll no.</dt>
            <dd className="font-semibold text-slate-900">{card.student.rollNo}</dd>
          </div>
        </dl>

        {card.rows.length === 0 ? (
          <p className="mt-6 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            No exams found for this report card.
          </p>
        ) : (
          <table className="mt-6 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
                <th scope="col" className="py-2 font-medium">Subject</th>
                <th scope="col" className="py-2 font-medium">Date</th>
                <th scope="col" className="py-2 text-right font-medium">Marks</th>
                <th scope="col" className="py-2 text-right font-medium">%</th>
                <th scope="col" className="py-2 text-right font-medium">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {card.rows.map((row) => (
                <tr key={row.examId}>
                  <td className="py-3 font-medium text-slate-900">{row.subject}</td>
                  <td className="py-3 text-slate-600">{formatExamDate(row.date)}</td>
                  <td className="py-3 text-right text-slate-700">
                    {row.marks === null ? 'Pending' : `${row.marks} / ${row.total}`}
                  </td>
                  <td className="py-3 text-right text-slate-700">{row.percent === null ? '—' : `${row.percent}%`}</td>
                  <td className="py-3 text-right font-semibold text-slate-900">{row.grade ?? '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                <td className="py-3" colSpan={2}>
                  Overall
                </td>
                <td className="py-3 text-right">{card.total > 0 ? `${card.obtained} / ${card.total}` : '—'}</td>
                <td className="py-3 text-right">{card.percent === null ? '—' : `${card.percent}%`}</td>
                <td className="py-3 text-right">{card.grade ?? '—'}</td>
              </tr>
            </tfoot>
          </table>
        )}

      <div className="mt-6 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-700">Result</span>
          {/* Icon + label, never colour alone. */}
          <span
            className={`inline-flex items-center gap-2 text-base font-semibold ${
              card.result === 'Pass' ? 'text-emerald-700' : card.result === 'Fail' ? 'text-red-700' : 'text-slate-700'
            }`}
          >
            {card.result === 'Pass' ? (
              <CircleCheck className="size-5" aria-hidden="true" />
            ) : card.result === 'Fail' ? (
              <CircleAlert className="size-5" aria-hidden="true" />
            ) : (
              <Clock className="size-5" aria-hidden="true" />
            )}
            {card.result ?? 'Awaiting marks'}
          </span>
        </div>
      </article>
    </div>
  )
}
