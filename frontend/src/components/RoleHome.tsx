import { CalendarCheck2, CalendarDays, ClipboardCheck, ClipboardList, Megaphone } from 'lucide-react'
import { getRole } from '../data/roles'
import type { AuthUser } from '../lib/auth'
import { LatestNotices } from './LatestNotices'
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

  if (role.id === 'teacher') {
    const quickNavItems = [
      {
        key: 'timetable',
        label: 'My timetable',
        description: 'Your weekly teaching schedule',
        icon: CalendarDays,
        iconWrap: 'bg-blue-50 text-blue-600',
        hover: 'hover:border-blue-200 hover:bg-blue-50',
        onClick: onOpenMyTimetable,
      },
      {
        key: 'attendance',
        label: 'Attendance',
        description: 'Present, Absent or Leave for each class',
        icon: ClipboardCheck,
        iconWrap: 'bg-amber-50 text-amber-600',
        hover: 'hover:border-amber-200 hover:bg-amber-50',
        onClick: onOpenMarkAttendance,
      },
      {
        key: 'notices',
        label: 'Notices',
        description: 'Post & view school announcements',
        icon: Megaphone,
        iconWrap: 'bg-rose-50 text-rose-600',
        hover: 'hover:border-rose-200 hover:bg-rose-50',
        onClick: onOpenNotices,
      },
    ]

    return (
      <DashboardShell onOpenProfile={onOpenProfile} onSignOut={onSignOut}>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${role.accentBadge}`}
        >
          <Icon className="size-3.5" />
          {role.label}
        </span>

        <h1 className="mt-4 text-3xl font-bold text-slate-900">Welcome, {user.name}</h1>
        <p className="mt-2 text-slate-500">{role.description}</p>

        <LatestNotices onViewAll={onOpenNotices} />

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-slate-700">Quick navigation</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickNavItems.map(({ key, label, description, icon: ItemIcon, iconWrap, hover, onClick }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className={`flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors ${hover}`}
              >
                <span className={`flex size-9 items-center justify-center rounded-full ${iconWrap}`}>
                  <ItemIcon className="size-4" />
                </span>
                <span className="text-sm font-semibold text-slate-900">{label}</span>
                <span className="text-xs text-slate-500">{description}</span>
              </button>
            ))}

            <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate-200 bg-white p-4 text-left opacity-70">
              <div className="flex w-full items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <ClipboardList className="size-4" />
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Coming soon
                </span>
              </div>
              <span className="text-sm font-semibold text-slate-900">Exams</span>
              <span className="text-xs text-slate-500">Schedules, grading & report cards</span>
            </div>
          </div>
        </section>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell onOpenProfile={onOpenProfile} onSignOut={onSignOut} mainClassName="mx-auto max-w-3xl px-6 py-16">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${role.accentBadge}`}
      >
        <Icon className="size-3.5" />
        {role.label}
      </span>

      <h1 className="mt-4 text-3xl font-bold text-slate-900">Welcome, {user.name}</h1>
      <p className="mt-2 text-slate-500">{role.description}</p>

      <LatestNotices onViewAll={onOpenNotices} />

      {role.id === 'student' ? (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-700">My timetable</h2>
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
              <span className="text-xs text-slate-500">Your weekly class schedule</span>
            </button>
          </div>

          <h2 className="mt-8 text-sm font-semibold text-slate-700">Attendance</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
