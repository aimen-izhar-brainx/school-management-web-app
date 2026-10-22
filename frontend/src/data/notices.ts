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

/** Notices a given role should see: school-wide, plus anything targeted at that role. */
export function visibleToRole(notices: Notice[], role: RoleId): Notice[] {
  return notices.filter((notice) => notice.audience === 'all' || notice.audience === role)
}
