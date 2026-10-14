import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { AdminCreatePage } from './AdminCreatePage'
import type { AuthUser } from '../lib/auth'
import { ApiError, api } from '../lib/http'
import type { Person } from '../lib/types'

vi.mock('../lib/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/http')>()),
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

const mockApi = vi.mocked(api)

const user: AuthUser = { id: 'admin-1', name: 'Avery Admin', email: 'avery@example.com', role: 'admin' }

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1', name: 'Taylor Teacher', email: 'taylor@example.com', role: 'teacher',
    phone: null, gender: null, address: null, employeeId: 'E-1', department: 'Maths',
    joiningDate: null, dateOfBirth: null, admissionDate: null, rollNumber: null, relationship: null,
    sectionId: null, section: null, parent: null, children: [],
    ...overrides,
  }
}

/** Routes GET calls by path; anything unlisted resolves to an empty list. */
function stubGets(routes: Record<string, unknown> = {}) {
  mockApi.get.mockImplementation((path: string) => Promise.resolve((routes[path] ?? []) as never))
}

function renderPage(overrides: Partial<Parameters<typeof AdminCreatePage>[0]> = {}) {
  const props = { user, initialTab: 'teacher' as const, onBack: vi.fn(), onSignOut: vi.fn(), ...overrides }
  const { container } = render(<AdminCreatePage {...props} />)
  return { ...props, container }
}

function submitActiveForm(container: HTMLElement) {
  const form = container.querySelector('form')
  if (!form) throw new Error('Expected a form to be rendered for the active tab')
  fireEvent.submit(form)
}

const fill = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('AdminCreatePage', () => {
  beforeEach(() => stubGets())
  afterEach(() => vi.resetAllMocks())

  describe('shell', () => {
    it('AC-01.1 header shows the GraduationCap icon and "Brainx School" text', async () => {
      renderPage()
      const header = screen.getByRole('banner')
      expect(within(header).getByText('Brainx School')).toBeInTheDocument()
      expect(document.querySelectorAll('.lucide-graduation-cap').length).toBeGreaterThan(0)
      await screen.findByText(/no teachers yet/i)
    })

    it('AC-01.2 header shows only a Sign out button, with no Profile button', async () => {
      const props = renderPage()
      const header = screen.getByRole('banner')
      const signOut = within(header).getByRole('button', { name: /sign out/i })
      expect(within(header).queryByRole('button', { name: /^profile$/i })).not.toBeInTheDocument()
      fireEvent.click(signOut)
      expect(props.onSignOut).toHaveBeenCalledTimes(1)
      await screen.findByText(/no teachers yet/i)
    })

    it('AC-01.5 clicking "Back to dashboard" calls onBack', async () => {
      const props = renderPage()
      fireEvent.click(screen.getByText(/back to dashboard/i))
      expect(props.onBack).toHaveBeenCalledTimes(1)
      await screen.findByText(/no teachers yet/i)
    })

    it('keeps the max-w-4xl content width', async () => {
      renderPage()
      expect(screen.getByText(/add people/i).closest('.max-w-4xl')).not.toBeNull()
      await screen.findByText(/no teachers yet/i)
    })

    it('UC-01-E3 discards unsaved input without a confirmation prompt on "Back to dashboard"', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm')
      const props = renderPage()
      await screen.findByText(/no teachers yet/i)
      fill(/full name/i, 'Unsaved')
      fireEvent.click(screen.getByText(/back to dashboard/i))
      expect(confirmSpy).not.toHaveBeenCalled()
      expect(props.onBack).toHaveBeenCalledTimes(1)
      confirmSpy.mockRestore()
    })

    it('loads each tab\'s people from /people?role=', async () => {
      renderPage({ initialTab: 'parent' })
      await screen.findByText(/no parents yet/i)
      expect(mockApi.get).toHaveBeenCalledWith('/people?role=parent')
      fireEvent.click(screen.getByRole('button', { name: /add student/i }))
      await screen.findByText(/no students yet\./i, { selector: 'p.mt-3' })
      expect(mockApi.get).toHaveBeenCalledWith('/people?role=student')
    })
  })

  describe('validation (client side, nothing is sent)', () => {
    it.each([['teacher', 'teacher’s'], ['parent', 'parent’s'], ['student', 'student’s']] as const)(
      'empty or whitespace name on the %s tab shows the name error before the email error',
      async (tab, possessive) => {
        const { container } = renderPage({ initialTab: tab })
        await screen.findByRole('heading', { name: /^add /i, level: 2 })
        fill(/email address/i, 'bob@')
        fill(/full name/i, '   ')
        submitActiveForm(container)
        expect(screen.getByRole('alert')).toHaveTextContent(`Please enter the ${possessive} full name.`)
        expect(mockApi.post).not.toHaveBeenCalled()
      },
    )

    it.each(['teacher', 'parent', 'student'] as const)('invalid email on the %s tab is rejected', async (tab) => {
      const { container } = renderPage({ initialTab: tab })
      await screen.findByRole('heading', { name: /^add /i, level: 2 })
      fill(/full name/i, 'Some One')
      fill(/email address/i, 'bob@')
      submitActiveForm(container)
      expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address.')
      expect(mockApi.post).not.toHaveBeenCalled()
    })
  })

  describe('create', () => {
    it('posts a trimmed teacher payload without empty fields, then shows the success message and reloads', async () => {
      mockApi.post.mockResolvedValue(person())
      const { container } = renderPage()
      await screen.findByText(/no teachers yet/i)
      fill(/full name/i, '  Taylor Teacher ')
      fill(/email address/i, 'taylor@example.com')
      fill(/subject \/ department/i, 'Maths')
      submitActiveForm(container)

      expect(await screen.findByText('Teacher account created for Taylor Teacher.')).toBeInTheDocument()
      expect(mockApi.post).toHaveBeenCalledWith('/people', {
        name: 'Taylor Teacher', email: 'taylor@example.com', department: 'Maths', role: 'teacher',
      })
      expect(mockApi.get.mock.calls.filter(([p]) => p === '/people?role=teacher')).toHaveLength(2)
      expect(screen.getByLabelText(/full name/i)).toHaveValue('')
    })

    it('posts a parent with linked students', async () => {
      stubGets({ '/people?role=student': [person({ id: 's1', name: 'Sam', role: 'student' })] })
      mockApi.post.mockResolvedValue(person({ role: 'parent' }))
      const { container } = renderPage({ initialTab: 'parent' })
      fireEvent.click(await screen.findByLabelText('Sam'))
      fill(/full name/i, 'Pat Parent')
      fill(/email address/i, 'pat@example.com')
      fill(/relationship/i, 'Mother')
      submitActiveForm(container)
      await screen.findByText('Parent account created for Pat Parent.')
      expect(mockApi.post).toHaveBeenCalledWith('/people', {
        name: 'Pat Parent', email: 'pat@example.com', relationship: 'Mother', studentIds: ['s1'], role: 'parent',
      })
    })

    it('posts a student with the chosen class section and parent', async () => {
      stubGets({
        '/sections': [{ id: 'sec1', name: 'A', classId: 'c1', className: 'Grade 1' }],
        '/people?role=parent': [person({ id: 'par1', name: 'Pat', role: 'parent' })],
      })
      mockApi.post.mockResolvedValue(person({ role: 'student' }))
      const { container } = renderPage({ initialTab: 'student' })
      await screen.findByRole('option', { name: 'Grade 1 – A' })
      await screen.findByRole('option', { name: 'Pat' })
      fill(/full name/i, 'Sam Student')
      fill(/email address/i, 'sam@example.com')
      fill(/class \/ section/i, 'sec1')
      fill(/parent \/ guardian/i, 'par1')
      submitActiveForm(container)
      await screen.findByText('Student account created for Sam Student.')
      expect(mockApi.post).toHaveBeenCalledWith('/people', {
        name: 'Sam Student', email: 'sam@example.com', sectionId: 'sec1', parentId: 'par1', role: 'student',
      })
    })

    it('shows the server message (e.g. duplicate email), keeps the typed values and creates nothing locally', async () => {
      mockApi.post.mockRejectedValue(new ApiError(409, { message: 'An account with this email already exists.' }))
      const { container } = renderPage()
      await screen.findByText(/no teachers yet/i)
      fill(/full name/i, 'Taylor')
      fill(/email address/i, 'taylor@example.com')
      submitActiveForm(container)
      expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.')
      expect(screen.getByLabelText(/full name/i)).toHaveValue('Taylor')
      expect(screen.queryByText(/account created/i)).not.toBeInTheDocument()
    })

    it('shows a generic message for server errors', async () => {
      mockApi.post.mockRejectedValue(new ApiError(500, { message: 'boom: internal detail' }))
      const { container } = renderPage()
      await screen.findByText(/no teachers yet/i)
      fill(/full name/i, 'Taylor')
      fill(/email address/i, 'taylor@example.com')
      submitActiveForm(container)
      expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    })
  })

  describe('list, edit, delete, invite', () => {
    const rows = [
      person({ id: 'b', name: 'Bea', email: 'bea@example.com' }),
      person({ id: 'a', name: 'Al', email: 'al@example.com', phone: '555', department: null, employeeId: null }),
    ]

    it('lists people sorted by name', async () => {
      stubGets({ '/people?role=teacher': rows })
      renderPage()
      const items = await screen.findAllByRole('listitem')
      expect(items.map((li) => within(li).getByText(/^(Al|Bea)$/).textContent)).toEqual(['Al', 'Bea'])
    })

    it('shows a retry when the list fails to load', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('network')).mockResolvedValue([] as never)
      renderPage()
      expect(await screen.findByRole('alert')).toHaveTextContent(/could not load teachers/i)
      fireEvent.click(screen.getByRole('button', { name: /try again/i }))
      await screen.findByText(/no teachers yet/i)
    })

    it('edits: prefills the form, PATCHes changes, sends null for cleared fields', async () => {
      stubGets({ '/people?role=teacher': rows })
      mockApi.patch.mockResolvedValue(rows[1])
      const { container } = renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Edit Al' }))
      expect(screen.getByRole('heading', { name: 'Edit teacher' })).toBeInTheDocument()
      expect(screen.getByLabelText(/full name/i)).toHaveValue('Al')
      expect(screen.getByLabelText(/phone number/i)).toHaveValue('555')

      fill(/full name/i, 'Alan')
      fill(/phone number/i, '')
      submitActiveForm(container)

      await screen.findByText('Teacher updated for Alan.')
      expect(mockApi.patch).toHaveBeenCalledWith('/people/a', {
        name: 'Alan', email: 'al@example.com', phone: null, gender: null, address: null,
        employeeId: null, department: null, joiningDate: null,
      })
      expect(screen.getByRole('heading', { name: 'Add teacher' })).toBeInTheDocument()
    })

    it('cancel leaves edit mode without saving', async () => {
      stubGets({ '/people?role=teacher': rows })
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Edit Al' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByRole('heading', { name: 'Add teacher' })).toBeInTheDocument()
      expect(mockApi.patch).not.toHaveBeenCalled()
    })

    it('delete needs a confirmation click, then deletes and reloads', async () => {
      stubGets({ '/people?role=teacher': rows })
      mockApi.delete.mockResolvedValue(undefined as never)
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Delete Al' }))
      expect(mockApi.delete).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
      await screen.findByText('Al was deleted.')
      expect(mockApi.delete).toHaveBeenCalledWith('/people/a')
    })

    it('keep cancels the pending delete', async () => {
      stubGets({ '/people?role=teacher': rows })
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Delete Al' }))
      fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
      expect(mockApi.delete).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Delete Al' })).toBeInTheDocument()
    })

    it('shows the server reason when a delete is refused (teacher on timetable)', async () => {
      stubGets({ '/people?role=teacher': rows })
      mockApi.delete.mockRejectedValue(new ApiError(409, { message: 'This teacher is still scheduled on the timetable.' }))
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Delete Al' }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('This teacher is still scheduled on the timetable.'),
      )
    })

    it('treats a 404 on delete as already deleted', async () => {
      stubGets({ '/people?role=teacher': rows })
      mockApi.delete.mockRejectedValue(new ApiError(404, { message: 'This person no longer exists.' }))
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Delete Al' }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
      await screen.findByText('Al was already deleted.')
    })

    it('resends an invite', async () => {
      stubGets({ '/people?role=teacher': rows })
      mockApi.post.mockResolvedValue(undefined as never)
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Resend invite to Al' }))
      await screen.findByText('Invite email sent to al@example.com.')
      expect(mockApi.post).toHaveBeenCalledWith('/people/a/invite')
    })
  })
})
