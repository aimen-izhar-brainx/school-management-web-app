import { GraduationCap, LogOut } from 'lucide-react'
import { getRole } from '../data/roles'
import type { AuthUser } from '../lib/auth'

interface RoleHomeProps {
  user: AuthUser
  onSignOut: () => void
}

/** Placeholder landing screen until the real per-role dashboards exist. */
export function RoleHome({ user, onSignOut }: RoleHomeProps) {
  const role = getRole(user.role)
  const Icon = role.icon

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <GraduationCap className="size-7" />
          Brainx School
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${role.accentBadge}`}
        >
          <Icon className="size-3.5" />
          {role.label}
        </span>

        <h1 className="mt-4 text-3xl font-bold text-slate-900">Welcome, {user.name}</h1>
        <p className="mt-2 text-slate-500">{role.description}</p>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Your {role.label.toLowerCase()} dashboard is coming soon.
        </div>
      </main>
    </div>
  )
}
