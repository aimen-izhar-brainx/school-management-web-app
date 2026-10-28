import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { Exam } from '../data/exams'
import type { AuthUser } from '../lib/auth'
import { CreateExamModal } from './CreateExamModal'
import { DashboardShell } from './DashboardShell'
import { primaryButton } from './examStyles'
import { ExamsSkeleton, LoadError } from './examUi'
import { ExamsTab } from './ExamsTab'
import { GradeScaleEditor } from './GradeScaleEditor'
import { ReportCardsTab } from './ReportCardsTab'
import { ToastRegion } from './Toasts'
import { useToasts } from './useToasts'
import { useExamData } from './useExamData'

interface ExamsPageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

type Tab = 'exams' | 'report-cards' | 'scale'

const TABS: { id: Tab; label: string }[] = [
  { id: 'exams', label: 'Exams & marks' },
  { id: 'report-cards', label: 'Report cards' },
  { id: 'scale', label: 'Grading scale' },
]

/**
 * Admin & teacher exam workspace. Page anatomy: title left with the single primary action right,
 * secondary navigation as tabs, then each tab's filters and content. Admins review; teachers enter marks.
 */
export function ExamsPage({ user, onBack, onSignOut }: ExamsPageProps) {
  const { data, error, reload } = useExamData()
  const { toasts, notify, dismiss } = useToasts()
  const [tab, setTab] = useState<Tab>('exams')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Exam | null>(null)
  const isAdmin = user.role === 'admin'

  const pending = data ? data.exams.filter((exam) => exam.markCount === 0).length : 0

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-5xl px-6 py-12">
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-bold leading-tight text-slate-900">Exams</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isAdmin
              ? 'Schedule exams, configure grading and review report cards.'
              : 'Enter marks and print report cards.'}
          </p>
        </div>
        {tab === 'exams' && data && isAdmin && (
          <button type="button" onClick={() => setCreating(true)} className={primaryButton}>
            <Plus className="size-5" aria-hidden="true" />
            Create exam
          </button>
        )}
      </div>

      <div role="tablist" aria-label="Exam sections" className="mt-8 flex gap-1 border-b border-slate-200">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            type="button"
            aria-selected={tab === id}
            aria-controls="exam-panel"
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors duration-150 ease-out ${
              tab === id
                ? 'border-violet-700 bg-violet-50 text-violet-800'
                : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div id="exam-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-6 space-y-4">
        {error && !data && <LoadError message={error} onRetry={() => void reload()} />}
        {!data && !error && <ExamsSkeleton />}

        {data && tab === 'exams' && (
          <>
            {data.exams.length > 0 && (
              <p className="text-xs text-slate-600">
                {pending === 0
                  ? 'Every exam has marks entered.'
                  : `${pending} of ${data.exams.length} ${data.exams.length === 1 ? 'exam has' : 'exams have'} no marks yet.`}
              </p>
            )}
            <ExamsTab data={data} canEnterMarks={!isAdmin} canManageExams={isAdmin} onEdit={setEditing} onChanged={reload} notify={notify} />
          </>
        )}
        {data && tab === 'report-cards' && <ReportCardsTab data={data} />}
        {data && tab === 'scale' && <GradeScaleEditor scale={data.scale} canEdit={isAdmin} onSaved={reload} notify={notify} />}
      </div>

      {(creating || editing) && data && (
        <CreateExamModal
          exams={data.exams}
          sections={data.sections}
          editing={editing ?? undefined}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onError={(message) => notify('error', message)}
          onCreated={(exam) => {
            notify('success', `${editing ? 'Updated' : 'Created'} ${exam.subject} · ${exam.name}.`)
            setCreating(false)
            setEditing(null)
            void reload()
          }}
        />
      )}

      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </DashboardShell>
  )
}
