import { GraduationCap, UserRound, Users } from 'lucide-react'
import { useState } from 'react'
import type { AuthUser } from '../lib/auth'
import { DashboardShell } from './DashboardShell'
import { PeopleSection } from './PeopleSection'

interface AdminCreatePageProps {
  user: AuthUser
  /** Which tab to land on — set by the quick-action the admin clicked from the dashboard. */
  initialTab: PersonTab
  onBack: () => void
  onSignOut: () => void
}

export type PersonTab = 'teacher' | 'student' | 'parent'

const tabs: { id: PersonTab; label: string; icon: typeof Users; activeClasses: string; badgeClasses: string }[] = [
  {
    id: 'teacher',
    label: 'Add teacher',
    icon: Users,
    activeClasses: 'border-blue-200 bg-blue-50 text-blue-700',
    badgeClasses: 'bg-blue-50 text-blue-600',
  },
  {
    id: 'student',
    label: 'Add student',
    icon: GraduationCap,
    activeClasses: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    badgeClasses: 'bg-emerald-50 text-emerald-600',
  },
  {
    id: 'parent',
    label: 'Add parent',
    icon: UserRound,
    activeClasses: 'border-amber-200 bg-amber-50 text-amber-700',
    badgeClasses: 'bg-amber-50 text-amber-600',
  },
]

/** Admin-only screen for managing teacher, student and parent accounts (list, add, edit, delete). */
export function AdminCreatePage({ user, initialTab, onBack, onSignOut }: AdminCreatePageProps) {
  const [tab, setTab] = useState<PersonTab>(initialTab)
  const activeTab = tabs.find((candidate) => candidate.id === tab) ?? tabs[0]

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-4xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Add people</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage teacher, student and parent accounts for {user.name.split(' ')[0]}&rsquo;s school.
      </p>

      <div className="mt-8 flex flex-col gap-8 sm:flex-row">
        <nav className="flex shrink-0 gap-2 sm:w-48 sm:flex-col">
          {tabs.map(({ id, label, icon: Icon, activeClasses }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                tab === id ? activeClasses : 'border-transparent text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 max-w-lg flex-1">
          <span className={`mb-4 flex size-11 items-center justify-center rounded-full ${activeTab.badgeClasses}`}>
            <activeTab.icon className="size-5" />
          </span>
          <PeopleSection key={tab} role={tab} />
        </div>
      </div>
    </DashboardShell>
  )
}
