import type { Notice, NoticeAudience } from '../data/notices'
import { api, ApiError } from './http'

export interface NoticeInput {
  title: string
  description: string
  audience: NoticeAudience
}

export class NoticesError extends Error {}

async function call<T>(action: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await action()
  } catch (cause) {
    throw new NoticesError(cause instanceof ApiError ? cause.message : fallback)
  }
}

export const NOTICES_PAGE_SIZE = 20

export interface NoticePage {
  items: Notice[]
  total: number
}

/** One page of notices, newest first, already filtered by the server for the caller's role. */
export const listNotices = (page: number) =>
  call(
    () => api.get<NoticePage>(`/notices?page=${page}&limit=${NOTICES_PAGE_SIZE}`),
    'Could not load notices.',
  )

export const createNotice = (input: NoticeInput) =>
  call(() => api.post<Notice>('/notices', input), 'Could not post the notice.')

export const deleteNotice = (id: string) =>
  call(() => api.delete(`/notices/${encodeURIComponent(id)}`), 'Could not delete the notice.')
