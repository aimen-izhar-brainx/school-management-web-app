import { ArrowLeft, GraduationCap, LogOut, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'

interface DashboardShellProps {
  children: ReactNode
  onSignOut: () => void
  /** Shows a "Back to dashboard" link above the page content when provided. */
  onBack?: () => void
  /** Shows a Profile button in the header (before Sign out) when provided. */
  onOpenProfile?: () => void
}

/**
 * Shared post-login page frame: branded header plus Sign out (and optionally
 * Profile and a "Back to dashboard" link), mirroring the shell pattern
 * established by `AuthShell` for the sign-in flow.
 */
export function DashboardShell({ children, onSignOut, onBack, onOpenProfile }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <GraduationCap className="size-7" />
          Brainx School
        </div>
        <div className="flex items-center gap-2">
          {onOpenProfile && (
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <UserRound className="size-4" />
              Profile
            </button>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
          >
            <ArrowLeft className="size-4" />
            Back to dashboard
          </button>
        )}

        {children}
      </main>
    </div>
  )
}
