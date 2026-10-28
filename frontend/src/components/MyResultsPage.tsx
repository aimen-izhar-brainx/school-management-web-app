import { ClipboardList } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { buildReportCard } from '../data/exams'
import type { AuthUser } from '../lib/auth'
import { getMyResults, type MyResults } from '../lib/exams'
import { DashboardShell } from './DashboardShell'
import { fieldClass } from './examStyles'
import { EmptyState, ExamsSkeleton, LoadError } from './examUi'
import { ReportCard } from './ReportCard'

interface MyResultsPageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

/**
 * Read-only results for the signed-in student. The backend returns only that student's own marks,
 * so no one else's data ever reaches the browser. Parent accounts are not linked to a child yet.
 */
export function MyResultsPage({ user, onBack, onSignOut }: MyResultsPageProps) {
  const [data, setData] = useState<MyResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      setData(await getMyResults())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your results.')
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  const [examName, setExamName] = useState('')

  const names = data ? [...new Set(data.exams.map((exam) => exam.name))] : []
  const activeName = names.includes(examName) ? examName : (names[0] ?? '')

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mt-4 text-[32px] font-bold leading-tight text-slate-900">
        {user.role === 'parent' ? 'My child’s results' : 'My results'}
      </h1>
      <p className="mt-1 text-sm text-slate-600">Marks, grades and the overall result for each exam.</p>

      <div className="mt-8 space-y-6">
        {error && !data && <LoadError message={error} onRetry={() => void reload()} />}
        {!data && !error && <ExamsSkeleton />}

        {data && names.length === 0 && (
          <EmptyState icon={ClipboardList} title="No results published yet">
            Results appear here after your teachers enter marks for an exam.
          </EmptyState>
        )}

        {data && names.length > 0 && (
          <>
            <div className="max-w-xs">
              <label htmlFor="my-results-exam" className="block text-sm font-medium text-slate-800">
                Exam
              </label>
              <select id="my-results-exam" value={activeName} onChange={(event) => setExamName(event.target.value)} className={fieldClass}>
                {names.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <ReportCard card={buildReportCard(data.student, activeName, data.exams, data.marks, data.scale)} />
          </>
        )}
      </div>
    </DashboardShell>
  )
}
