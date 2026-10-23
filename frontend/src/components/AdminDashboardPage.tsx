import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  Megaphone,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { getTodayKey } from '../data/attendance'
import { getRole } from '../data/roles'
import { SECTION_OPTIONS, TEACHERS } from '../data/timetable'
import type { AuthUser } from '../lib/auth'
import { getDailySummary, type DailySectionSummary } from '../lib/attendance'
import { DashboardShell } from './DashboardShell'
import type { DirectoryTab } from '../lib/people'

interface AdminDashboardPageProps {
  user: AuthUser
  onOpenProfile: () => void
  onOpenPeople: (tab: DirectoryTab) => void
  onOpenClasses: () => void
  onOpenTimetable: () => void
  onOpenAttendance: () => void
  onOpenNotices: () => void
  onSignOut: () => void
}

interface QuickNavItem {
  key: string
  label: string
  description: string
  icon: LucideIcon
  iconWrap: string
  hover: string
  onClick: () => void
}

interface ComingSoonItem {
  key: string
  label: string
  description: string
  icon: LucideIcon
}

/** Admin landing screen: school-wide overview stats plus quick links into the core modules. */
export function AdminDashboardPage({
  user,
  onOpenProfile,
  onOpenPeople,
  onOpenClasses,
  onOpenTimetable,
  onOpenAttendance,
  onOpenNotices,
  onSignOut,
}: AdminDashboardPageProps) {
  const role = getRole('admin')
  const RoleIcon = role.icon

  const totalTeachers = TEACHERS.length
  const totalSections = SECTION_OPTIONS.length
  const totalClasses = new Set(SECTION_OPTIONS.map((section) => section.className)).size
  const [todayRows, setTodayRows] = useState<DailySectionSummary[]>([])

  useEffect(() => {
    let active = true
    getDailySummary(getTodayKey())
      .then((rows) => {
        if (active) setTodayRows(rows)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const totalStudents = todayRows.reduce((sum, row) => sum + row.enrolled, 0)
  const marked = todayRows.filter((row) => row.marked)
  const attendance = {
    present: marked.reduce((sum, row) => sum + row.present, 0),
    absent: marked.reduce((sum, row) => sum + row.absent, 0),
    markedSections: marked.length,
    totalSections: todayRows.length,
  }

  const quickNavItems: QuickNavItem[] = [
    {
      key: 'students',
      label: 'Students',
      description: 'Browse, enrol & manage students',
      icon: GraduationCap,
      iconWrap: 'bg-emerald-50 text-emerald-600',
      hover: 'hover:border-emerald-200 hover:bg-emerald-50',
      onClick: () => onOpenPeople('student'),
    },
    {
      key: 'teachers',
      label: 'Teachers',
      description: 'Browse, add & manage teachers',
      icon: Users,
      iconWrap: 'bg-blue-50 text-blue-600',
      hover: 'hover:border-blue-200 hover:bg-blue-50',
      onClick: () => onOpenPeople('teacher'),
    },
    {
      key: 'classes',
      label: 'Classes',
      description: 'Sections, subjects & class teachers',
      icon: BookOpen,
      iconWrap: 'bg-violet-50 text-violet-600',
      hover: 'hover:border-violet-200 hover:bg-violet-50',
      onClick: onOpenClasses,
    },
    {
      key: 'timetable',
      label: 'Timetable',
      description: 'Subjects, teachers & time slots per day',
      icon: CalendarDays,
      iconWrap: 'bg-blue-50 text-blue-600',
      hover: 'hover:border-blue-200 hover:bg-blue-50',
      onClick: onOpenTimetable,
    },
    {
      key: 'attendance',
      label: 'Attendance',
      description: 'Browse, correct & report on attendance',
      icon: ClipboardCheck,
      iconWrap: 'bg-amber-50 text-amber-600',
      hover: 'hover:border-amber-200 hover:bg-amber-50',
      onClick: onOpenAttendance,
    },
    {
      key: 'notices',
      label: 'Notices',
      description: 'Post & manage school announcements',
      icon: Megaphone,
      iconWrap: 'bg-rose-50 text-rose-600',
      hover: 'hover:border-rose-200 hover:bg-rose-50',
      onClick: onOpenNotices,
    },
  ]

  const comingSoonItems: ComingSoonItem[] = [
    {
      key: 'exams',
      label: 'Exams',
      description: 'Schedules, grading & report cards',
      icon: ClipboardList,
    },
  ]

  return (
    <DashboardShell onOpenProfile={onOpenProfile} onSignOut={onSignOut}>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${role.accentBadge}`}
      >
        <RoleIcon className="size-3.5" />
        {role.label}
      </span>

      <h1 className="mt-4 text-3xl font-bold text-slate-900">Welcome, {user.name}</h1>
      <p className="mt-2 text-slate-500">Here&rsquo;s what&rsquo;s happening across the school today.</p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700">Overview</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={GraduationCap}
            iconWrap="bg-emerald-50 text-emerald-600"
            label="Total students"
            value={totalStudents}
          />
          <StatCard
            icon={Users}
            iconWrap="bg-blue-50 text-blue-600"
            label="Total teachers"
            value={totalTeachers}
          />
          <StatCard
            icon={BookOpen}
            iconWrap="bg-violet-50 text-violet-600"
            label="Classes & sections"
            value={totalSections}
            caption={`Across ${totalClasses} class${totalClasses === 1 ? '' : 'es'}`}
          />

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <span className="flex size-9 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <ClipboardCheck className="size-4" />
            </span>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Today&rsquo;s attendance
            </p>

            {attendance.markedSections === 0 ? (
              <>
                <p className="mt-1 text-2xl font-bold text-slate-900">&mdash;</p>
                <p className="mt-1 text-xs font-medium text-amber-600">Not marked yet for today</p>
              </>
            ) : (
              <>
                <div className="mt-1 flex items-baseline gap-4">
                  <span>
                    <span className="text-2xl font-bold text-emerald-600">{attendance.present}</span>{' '}
                    <span className="text-xs text-slate-400">present</span>
                  </span>
                  <span>
                    <span className="text-2xl font-bold text-red-600">{attendance.absent}</span>{' '}
                    <span className="text-xs text-slate-400">absent</span>
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {attendance.markedSections} of {attendance.totalSections} sections marked
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-slate-700">Quick navigation</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickNavItems.map(({ key, label, description, icon: Icon, iconWrap, hover, onClick }) => (
            <button
              key={key}
              type="button"
              onClick={onClick}
              className={`flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors ${hover}`}
            >
              <span className={`flex size-9 items-center justify-center rounded-full ${iconWrap}`}>
                <Icon className="size-4" />
              </span>
              <span className="text-sm font-semibold text-slate-900">{label}</span>
              <span className="text-xs text-slate-500">{description}</span>
            </button>
          ))}

          {comingSoonItems.map(({ key, label, description, icon: Icon }) => (
            <div
              key={key}
              className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate-200 bg-white p-4 text-left opacity-70"
            >
              <div className="flex w-full items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <Icon className="size-4" />
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Coming soon
                </span>
              </div>
              <span className="text-sm font-semibold text-slate-900">{label}</span>
              <span className="text-xs text-slate-500">{description}</span>
            </div>
          ))}
        </div>
      </section>
    </DashboardShell>
  )
}

function StatCard({
  icon: Icon,
  iconWrap,
  label,
  value,
  caption,
}: {
  icon: LucideIcon
  iconWrap: string
  label: string
  value: number | string
  caption?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <span className={`flex size-9 items-center justify-center rounded-full ${iconWrap}`}>
        <Icon className="size-4" />
      </span>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {caption && <p className="mt-1 text-xs text-slate-400">{caption}</p>}
    </div>
  )
}
