import { CalendarCheck2, CalendarDays, ClipboardCheck, Megaphone } from 'lucide-react'
import { getRole } from '../data/roles'
import type { AuthUser } from '../lib/auth'
import { DashboardShell } from './DashboardShell'

interface RoleHomeProps {
  user: AuthUser
  onOpenProfile: () => void
  onOpenMyTimetable: () => void
  onOpenMarkAttendance: () => void
  onOpenMyAttendance: () => void
  onOpenNotices: () => void
  onSignOut: () => void
}

/** Placeholder landing screen for teacher, student & parent roles until their real dashboards exist. Admin has its own AdminDashboardPage. */
export function RoleHome({
  user,
  onOpenProfile,
  onOpenMyTimetable,
  onOpenMarkAttendance,
  onOpenMyAttendance,
  onOpenNotices,
  onSignOut,
}: RoleHomeProps) {
  const role = getRole(user.role)
  const Icon = role.icon

  return (
    <DashboardShell
      onOpenProfile={onOpenProfile}
      onSignOut={onSignOut}
      mainClassName="mx-auto max-w-3xl px-6 py-16"
    >
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${role.accentBadge}`}
      >
        <Icon className="size-3.5" />
        {role.label}
      </span>

      <h1 className="mt-4 text-3xl font-bold text-slate-900">Welcome, {user.name}</h1>
      <p className="mt-2 text-slate-500">{role.description}</p>

      {role.id === 'teacher' || role.id === 'student' ? (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-700">Timetable</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={onOpenMyTimetable}
              className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-violet-200 hover:bg-violet-50"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                <CalendarDays className="size-4" />
              </span>
              <span className="text-sm font-semibold text-slate-900">View timetable</span>
              <span className="text-xs text-slate-500">
                {role.id === 'teacher' ? 'Your weekly teaching schedule' : 'Your weekly class schedule'}
              </span>
            </button>
          </div>

          <h2 className="mt-8 text-sm font-semibold text-slate-700">Attendance</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {role.id === 'teacher' ? (
              <button
                type="button"
                onClick={onOpenMarkAttendance}
                className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-violet-200 hover:bg-violet-50"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                  <ClipboardCheck className="size-4" />
                </span>
                <span className="text-sm font-semibold text-slate-900">Mark attendance</span>
                <span className="text-xs text-slate-500">Present, Absent or Leave for each class</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenMyAttendance}
                className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-violet-200 hover:bg-violet-50"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                  <CalendarCheck2 className="size-4" />
                </span>
                <span className="text-sm font-semibold text-slate-900">My attendance</span>
                <span className="text-xs text-slate-500">Your daily record & monthly percentage</span>
              </button>
            )}
          </div>

          <h2 className="mt-8 text-sm font-semibold text-slate-700">Communication</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={onOpenNotices}
              className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-violet-200 hover:bg-violet-50"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                <Megaphone className="size-4" />
              </span>
              <span className="text-sm font-semibold text-slate-900">Notices</span>
              <span className="text-xs text-slate-500">
                {role.id === 'teacher' ? 'Post & view school announcements' : 'School & class announcements'}
              </span>
            </button>
          </div>

          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            The rest of your {role.label.toLowerCase()} dashboard is coming soon.
          </div>
        </div>
      ) : role.id === 'parent' ? (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-700">Attendance</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={onOpenMyAttendance}
              className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-violet-200 hover:bg-violet-50"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                <CalendarCheck2 className="size-4" />
              </span>
              <span className="text-sm font-semibold text-slate-900">My child&rsquo;s attendance</span>
              <span className="text-xs text-slate-500">Daily record & monthly percentage</span>
            </button>
          </div>

          <h2 className="mt-8 text-sm font-semibold text-slate-700">Communication</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={onOpenNotices}
              className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-violet-200 hover:bg-violet-50"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                <Megaphone className="size-4" />
              </span>
              <span className="text-sm font-semibold text-slate-900">Notices</span>
              <span className="text-xs text-slate-500">School & class announcements</span>
            </button>
          </div>

          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            The rest of your {role.label.toLowerCase()} dashboard is coming soon.
          </div>
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Your {role.label.toLowerCase()} dashboard is coming soon.
        </div>
      )}
    </DashboardShell>
  )
}
