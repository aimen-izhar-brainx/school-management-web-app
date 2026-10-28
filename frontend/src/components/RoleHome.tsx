import { CalendarCheck2, CalendarDays, ClipboardCheck, ClipboardList, Megaphone, type LucideIcon } from 'lucide-react'
import { getRole } from '../data/roles'
import type { AuthUser } from '../lib/auth'
import { DashboardShell } from './DashboardShell'

interface NavItem {
  key: string
  label: string
  description: string
  icon: LucideIcon
  iconWrap: string
  hover: string
  onClick: () => void
}

interface RoleHomeProps {
  user: AuthUser
  onOpenProfile: () => void
  onOpenMyTimetable: () => void
  onOpenMarkAttendance: () => void
  onOpenMyAttendance: () => void
  onOpenNotices: () => void
  onOpenExams: () => void
  onOpenMyResults: () => void
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
  onOpenExams,
  onOpenMyResults,
  onSignOut,
}: RoleHomeProps) {
  const role = getRole(user.role)
  const Icon = role.icon
  const isTeacher = role.id === 'teacher'

  const navItems: NavItem[] = [
    {
      key: 'timetable',
      label: 'View timetable',
      description: isTeacher ? 'Your weekly teaching schedule' : 'Your weekly class schedule',
      icon: CalendarDays,
      iconWrap: 'bg-blue-50 text-blue-600',
      hover: 'hover:border-blue-200 hover:bg-blue-50',
      onClick: onOpenMyTimetable,
    },
    isTeacher
      ? {
          key: 'attendance',
          label: 'Mark attendance',
          description: 'Present, Absent or Leave for each class',
          icon: ClipboardCheck,
          iconWrap: 'bg-amber-50 text-amber-600',
          hover: 'hover:border-amber-200 hover:bg-amber-50',
          onClick: onOpenMarkAttendance,
        }
      : {
          key: 'attendance',
          label: 'My attendance',
          description: 'Your daily record & monthly percentage',
          icon: CalendarCheck2,
          iconWrap: 'bg-amber-50 text-amber-600',
          hover: 'hover:border-amber-200 hover:bg-amber-50',
          onClick: onOpenMyAttendance,
        },
    {
      key: 'exams',
      label: isTeacher ? 'Exams & marks' : 'My results',
      description: isTeacher ? 'Enter marks & print report cards' : 'Marks, grades & report card',
      icon: ClipboardList,
      iconWrap: 'bg-indigo-50 text-indigo-600',
      hover: 'hover:border-indigo-200 hover:bg-indigo-50',
      onClick: isTeacher ? onOpenExams : onOpenMyResults,
    },
    {
      key: 'notices',
      label: 'Notices',
      description: isTeacher ? 'Post & view school announcements' : 'School & class announcements',
      icon: Megaphone,
      iconWrap: 'bg-rose-50 text-rose-600',
      hover: 'hover:border-rose-200 hover:bg-rose-50',
      onClick: onOpenNotices,
    },
  ]

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
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-700">Quick navigation</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {navItems.map(({ key, label, description, icon: NavIcon, iconWrap, hover, onClick }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className={`flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors ${hover}`}
              >
                <span className={`flex size-9 items-center justify-center rounded-full ${iconWrap}`}>
                  <NavIcon className="size-4" />
                </span>
                <span className="text-sm font-semibold text-slate-900">{label}</span>
                <span className="text-xs text-slate-500">{description}</span>
              </button>
            ))}
          </div>
        </section>
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

          <h2 className="mt-8 text-sm font-semibold text-slate-700">Exams</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={onOpenMyResults}
              className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-violet-200 hover:bg-violet-50"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                <ClipboardList className="size-4" />
              </span>
              <span className="text-sm font-semibold text-slate-900">My child&rsquo;s results</span>
              <span className="text-xs text-slate-500">Marks, grades & report card</span>
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
