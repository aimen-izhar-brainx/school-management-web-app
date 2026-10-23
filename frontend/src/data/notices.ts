import { getRole, type RoleId } from './roles'

export type NoticeAudience = 'all' | RoleId

export interface Notice {
  id: string
  title: string
  description: string
  audience: NoticeAudience
  postedBy: { id: string; name: string; role: RoleId }
  createdAt: string
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
