import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import type { AuthUser } from '../lib/auth'
import { deleteTeacher, listStudents, listTeachers, PeopleError } from '../lib/people'
import { PeopleListPage } from './PeopleListPage'

vi.mock('../lib/people', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/people')>()),
  listTeachers: vi.fn(),
  listStudents: vi.fn(),
  deleteTeacher: vi.fn(),
  deleteStudent: vi.fn(),
}))

const user: AuthUser = { id: 'a1', name: 'Avery Admin', email: 'a@example.com', role: 'admin' }

const teacher = {
  id: 't1',
  employeeId: 'E-1',
  subject: 'Maths',
  user: { id: 'u1', name: 'Tara Teacher', email: 'tara@example.com' },
}
const student = {
  id: 's1',
  rollNumber: 'R-1',
  grade: 'Grade 2',
  section: 'B',
  user: { id: 'u2', name: 'Sam Student', email: 'sam@example.com' },
}

const page = <T,>(data: T[]) => ({ data, meta: { page: 1, limit: 20, total: data.length } })

function renderPage(initialTab: 'teacher' | 'student' = 'teacher') {
  const props = { user, initialTab, onBack: vi.fn(), onAdd: vi.fn(), onSignOut: vi.fn() }
  render(<PeopleListPage {...(props as Parameters<typeof PeopleListPage>[0])} />)
  return props
}

describe('PeopleListPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('lists teachers from the API', async () => {
    vi.mocked(listTeachers).mockResolvedValue(page([teacher]) as never)
    renderPage('teacher')

    expect(await screen.findByText('Tara Teacher')).toBeInTheDocument()
    expect(screen.getByText('tara@example.com')).toBeInTheDocument()
    expect(listTeachers).toHaveBeenCalledWith(1, 20)
  })

  it('switches to students and lists them', async () => {
    vi.mocked(listTeachers).mockResolvedValue(page([teacher]) as never)
    vi.mocked(listStudents).mockResolvedValue(page([student]) as never)
    renderPage('teacher')
    await screen.findByText('Tara Teacher')

    fireEvent.click(screen.getByRole('button', { name: 'Students' }))

    expect(await screen.findByText('Sam Student')).toBeInTheDocument()
    expect(screen.getByText('Grade 2 – B')).toBeInTheDocument()
  })

  it('shows an error when loading fails', async () => {
    vi.mocked(listTeachers).mockRejectedValue(new PeopleError('Could not load teachers.'))
    renderPage('teacher')

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load teachers.')
  })

  it('shows an empty state', async () => {
    vi.mocked(listTeachers).mockResolvedValue(page([]) as never)
    renderPage('teacher')

    expect(await screen.findByText('No teachers yet.')).toBeInTheDocument()
  })

  it('deletes after confirmation and reloads the list', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(listTeachers).mockResolvedValueOnce(page([teacher]) as never).mockResolvedValueOnce(page([]) as never)
    vi.mocked(deleteTeacher).mockResolvedValue(undefined)
    renderPage('teacher')

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Tara Teacher' }))

    await waitFor(() => expect(deleteTeacher).toHaveBeenCalledWith('t1'))
    expect(await screen.findByText('No teachers yet.')).toBeInTheDocument()
  })

  it('does not delete when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    vi.mocked(listTeachers).mockResolvedValue(page([teacher]) as never)
    renderPage('teacher')

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Tara Teacher' }))

    expect(deleteTeacher).not.toHaveBeenCalled()
  })

  it('"Add teacher" opens the create form on the same tab', async () => {
    vi.mocked(listTeachers).mockResolvedValue(page([teacher]) as never)
    const props = renderPage('teacher')
    await screen.findByText('Tara Teacher')

    fireEvent.click(screen.getByRole('button', { name: /add teacher/i }))

    expect(props.onAdd).toHaveBeenCalledWith('teacher')
  })
})
