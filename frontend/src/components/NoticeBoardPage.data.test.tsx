import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { NoticeBoardPage } from './NoticeBoardPage'
import { LatestNotices } from './LatestNotices'
import type { AuthUser } from '../lib/auth'
import { api } from '../lib/http'
import type { Notice } from '../lib/types'

vi.mock('../lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/http')>()
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

const mockApi = api as unknown as Record<'get' | 'post' | 'delete', ReturnType<typeof vi.fn>>

const teacher: AuthUser = { id: 't1', name: 'Tina Teacher', email: 't@example.com', role: 'teacher' }
const student: AuthUser = { id: 's1', name: 'Sam Student', email: 's@example.com', role: 'student' }

const notice = (over: Partial<Notice> = {}): Notice => ({
  id: 'n1',
  title: 'Sports Day',
  description: 'Bring water.',
  createdAt: '2026-09-18T09:00:00.000Z',
  class: null,
  postedBy: 'Admin',
  postedByRole: 'admin',
  canDelete: false,
  ...over,
})

function stubGets(notices: Notice[]) {
  mockApi.get.mockImplementation((path: string) =>
    Promise.resolve(path.startsWith('/classes') ? [{ id: 'c1', name: 'Grade 5' }] : notices),
  )
}

beforeEach(() => vi.clearAllMocks())

describe('NoticeBoardPage (API)', () => {
  it('lists notices from the API with their audience', async () => {
    stubGets([notice(), notice({ id: 'n2', title: 'Quiz', class: { id: 'c1', name: 'Grade 5' } })])
    render(<NoticeBoardPage user={student} onBack={vi.fn()} onSignOut={vi.fn()} />)
    expect(await screen.findByText('Sports Day')).toBeInTheDocument()
    expect(screen.getByText('Grade 5')).toBeInTheDocument()
    expect(mockApi.get).toHaveBeenCalledWith('/notices')
    expect(screen.queryByRole('button', { name: /post notice/i })).not.toBeInTheDocument()
    expect(mockApi.get).not.toHaveBeenCalledWith('/classes')
  })

  it('posts a notice to a chosen class', async () => {
    stubGets([])
    mockApi.post.mockResolvedValue(notice({ id: 'n9', title: 'Trip', class: { id: 'c1', name: 'Grade 5' } }))
    render(<NoticeBoardPage user={teacher} onBack={vi.fn()} onSignOut={vi.fn()} />)
    await screen.findByText('No notices yet.')
    await screen.findByRole('option', { name: 'Grade 5' })

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: ' Trip ' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Details' } })
    fireEvent.change(screen.getByLabelText('Target audience'), { target: { value: 'c1' } })
    fireEvent.click(screen.getByRole('button', { name: /post notice/i }))

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/notices', { title: 'Trip', description: 'Details', classId: 'c1' }),
    )
    expect(await screen.findByText('Trip')).toBeInTheDocument()
  })

  it('blocks an empty post and deletes only when allowed', async () => {
    stubGets([notice({ canDelete: true })])
    mockApi.delete.mockResolvedValue(undefined)
    render(<NoticeBoardPage user={teacher} onBack={vi.fn()} onSignOut={vi.fn()} />)
    await screen.findByText('Sports Day')

    fireEvent.click(screen.getByRole('button', { name: /post notice/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Please add both a title and a description.')
    expect(mockApi.post).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Sports Day' }))
    await waitFor(() => expect(screen.queryByText('Sports Day')).not.toBeInTheDocument())
    expect(mockApi.delete).toHaveBeenCalledWith('/notices/n1')
  })
})

describe('LatestNotices', () => {
  it('shows the latest notices and links to the full board', async () => {
    mockApi.get.mockResolvedValue([notice()])
    const onViewAll = vi.fn()
    render(<LatestNotices onViewAll={onViewAll} />)
    expect(await screen.findByText('Sports Day')).toBeInTheDocument()
    expect(mockApi.get).toHaveBeenCalledWith('/notices?limit=3')
    fireEvent.click(screen.getByRole('button', { name: 'View all' }))
    expect(onViewAll).toHaveBeenCalled()
  })

  it('shows an empty state and an error state', async () => {
    mockApi.get.mockResolvedValueOnce([])
    const { unmount } = render(<LatestNotices onViewAll={vi.fn()} />)
    expect(await screen.findByText('No notices yet.')).toBeInTheDocument()
    unmount()
    mockApi.get.mockRejectedValueOnce(new Error('x'))
    render(<LatestNotices onViewAll={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load notices.')
  })
})
