import { getRole, type RoleId } from './roles'

export type NoticeAudience = 'all' | RoleId

export interface Notice {
  id: string
  title: string
  description: string
  audience: NoticeAudience
  postedBy: string
  postedByRole: Extract<RoleId, 'admin' | 'teacher'>
  createdAt: string
}

let idCounter = 100
export function makeNoticeId(): string {
  idCounter += 1
  return `notice-${idCounter}`
}

export function audienceLabel(audience: NoticeAudience): string {
  if (audience === 'all') return 'All'
  return getRole(audience).label
}

export function formatNoticeDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Seed notices covering a school-wide announcement and role-targeted ones. */
export const INITIAL_NOTICES: Notice[] = [
  {
    id: 'notice-1',
    title: 'Annual Sports Day',
    description:
      'Annual Sports Day will be held on the school grounds. Please ensure students wear house colours and bring a water bottle.',
    audience: 'all',
    postedBy: 'Admin Office',
    postedByRole: 'admin',
    createdAt: '2026-09-18T09:00:00',
  },
  {
    id: 'notice-2',
    title: 'Parent-Teacher Meeting',
    description: 'PTM slots are now open for booking. Please check the portal for available time slots.',
    audience: 'parent',
    postedBy: 'Grace Kim',
    postedByRole: 'teacher',
    createdAt: '2026-09-20T14:30:00',
  },
  {
    id: 'notice-3',
    title: 'Winter Uniform',
    description: 'Winter uniforms are mandatory starting next Monday. Please check the updated dress code circular.',
    audience: 'all',
    postedBy: 'Admin Office',
    postedByRole: 'admin',
    createdAt: '2026-09-21T11:15:00',
  },
]

/** Notices a given role should see: school-wide, plus anything targeted at that role. */
export function visibleToRole(notices: Notice[], role: RoleId): Notice[] {
  return notices.filter((notice) => notice.audience === 'all' || notice.audience === role)
}
