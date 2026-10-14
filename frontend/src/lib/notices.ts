import type { Notice } from './types'

export function audienceLabel(notice: Notice): string {
  return notice.class ? notice.class.name : 'All'
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
