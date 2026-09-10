import { GraduationCap, ShieldCheck, Users, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type RoleId = 'admin' | 'teacher' | 'student' | 'parent'

export interface RoleConfig {
  id: RoleId
  label: string
  description: string
  icon: LucideIcon
  accentText: string
  accentBadge: string
  panelGradient: string
  button: string
}

export const roles: RoleConfig[] = [
  {
    id: 'admin',
    label: 'Admin',
    description: 'Manage staff, students & school-wide settings',
    icon: ShieldCheck,
    accentText: 'text-violet-700',
    accentBadge: 'border-violet-200 bg-violet-50 text-violet-700',
    panelGradient: 'from-violet-600 to-indigo-700',
    button: 'bg-violet-600 hover:bg-violet-700 focus-visible:outline-violet-600',
  },
  {
    id: 'teacher',
    label: 'Teacher',
    description: 'Track attendance, grades & classroom activity',
    icon: Users,
    accentText: 'text-blue-700',
    accentBadge: 'border-blue-200 bg-blue-50 text-blue-700',
    panelGradient: 'from-blue-600 to-cyan-700',
    button: 'bg-blue-600 hover:bg-blue-700 focus-visible:outline-blue-600',
  },
  {
    id: 'student',
    label: 'Student',
    description: 'View schedules, grades & assignments',
    icon: GraduationCap,
    accentText: 'text-emerald-700',
    accentBadge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    panelGradient: 'from-emerald-600 to-teal-700',
    button: 'bg-emerald-600 hover:bg-emerald-700 focus-visible:outline-emerald-600',
  },
  {
    id: 'parent',
    label: 'Parent',
    description: "Follow your child's progress & announcements",
    icon: UserRound,
    accentText: 'text-amber-700',
    accentBadge: 'border-amber-200 bg-amber-50 text-amber-700',
    panelGradient: 'from-amber-500 to-orange-600',
    button: 'bg-amber-600 hover:bg-amber-700 focus-visible:outline-amber-600',
  },
]

export function getRole(id: RoleId): RoleConfig {
  const role = roles.find((role) => role.id === id)
  if (!role) throw new Error(`Unknown role: ${id}`)
  return role
}
