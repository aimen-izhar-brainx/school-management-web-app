import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { ClassesPage } from './ClassesPage'
import type { AuthUser } from '../lib/auth'
import { api, ApiError } from '../lib/http'

// T-014: the class list is now backed by the real /classes API. The HTTP layer
// is mocked here (ApiError stays real). `patch`/`delete` are added to `api` by
// the implementation; they are mocked so the tests do not depend on fetch.
vi.mock('../lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/http')>()
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  }
})

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.resetAllMocks()
  mockApi.get.mockResolvedValue([])
})

// Tests for T-003: migrate ClassesPage's own header/main markup to the
// shared DashboardShell (T-002), with no visible or behavioral change.
//
// ClassesPage still renders its own duplicated header today, so these tests
// exercise the pre-migration component directly. They must keep passing
// unchanged once the migration replaces the header/main markup below with
// <DashboardShell>.

const user: AuthUser = { id: 'admin-1', name: 'Avery Admin', email: 'avery@example.com', role: 'admin' }

function renderPage(overrides: Partial<Parameters<typeof ClassesPage>[0]> = {}) {
  const props = {
    user,
    onBack: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  }
  render(<ClassesPage {...props} />)
  return props
}

describe('ClassesPage', () => {
  it('AC-01.1 header shows the GraduationCap icon and "Brainx School" text', () => {
    renderPage()
    const header = screen.getByRole('banner')

    expect(within(header).getByText('Brainx School')).toBeInTheDocument()
    expect(document.querySelectorAll('.lucide-graduation-cap').length).toBeGreaterThan(0)
  })

  it('AC-01.2 header shows only a Sign out button, with no Profile button', () => {
    const props = renderPage()
    const header = screen.getByRole('banner')

    const signOutButton = within(header).getByRole('button', { name: /sign out/i })
    expect(signOutButton).toBeInTheDocument()
    expect(within(header).queryByRole('button', { name: /^profile$/i })).not.toBeInTheDocument()

    fireEvent.click(signOutButton)
    expect(props.onSignOut).toHaveBeenCalledTimes(1)
  })

  it('AC-01.5 clicking "Back to dashboard" calls onBack', () => {
    const props = renderPage()
    fireEvent.click(screen.getByText(/back to dashboard/i))
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })

  it('own addition: preserves the max-w-5xl content width used before the DashboardShell migration', () => {
    renderPage()
    const heading = screen.getByRole('heading', { name: /^classes$/i })
    expect(heading.closest('.max-w-5xl')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// T-014: class list wired to the real API
// ---------------------------------------------------------------------------

const GENERIC_ERROR = 'Something went wrong. Please try again.'
const GONE = 'This class no longer exists.'
const grade5 = { id: 'c1', name: 'Grade 5' }
const grade6 = { id: 'c2', name: 'Grade 6' }

const teacher: AuthUser = { id: 't-1', name: 'Tina Teacher', email: 't@example.com', role: 'teacher' }
const student: AuthUser = { id: 's-1', name: 'Sam Student', email: 's@example.com', role: 'student' }

interface SectionRow {
  id: string
  name: string
  classTeacher: { id: string; name: string } | null
}
interface GetRoutes {
  classes?: { id: string; name: string }[]
  sections?: Record<string, SectionRow[]>
  teachers?: { id: string; name: string }[]
}

// T-018: the page now calls api.get for several URLs, so GET is mocked per URL.
// `routes` is read at call time, so tests may mutate it to simulate server state.
function mockGet(routes: GetRoutes) {
  mockApi.get.mockImplementation((url: string) => {
    if (url === '/classes') return Promise.resolve(routes.classes ?? [])
    const sectionsMatch = url.match(/^\/classes\/([^/]+)\/sections$/)
    if (sectionsMatch) return Promise.resolve(routes.sections?.[sectionsMatch[1]] ?? [])
    if (url.startsWith('/users')) return Promise.resolve(routes.teachers ?? [])
    return Promise.reject(new Error(`unexpected GET ${url}`))
  })
}

const classListCalls = () => mockApi.get.mock.calls.filter((call) => call[0] === '/classes').length

async function renderWithClasses(classes: { id: string; name: string }[], overrides = {}) {
  mockGet({ classes })
  const props = renderPage(overrides)
  if (classes.length > 0) await screen.findByRole('button', { name: new RegExp(classes[0].name) })
  else await screen.findByText('No classes yet.')
  return props
}

async function selectClass(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) }))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('ClassesPage class list (T-014)', () => {
  it('AC-05.1 shows "No classes yet." when the API returns an empty list', async () => {
    mockApi.get.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No classes yet.')).toBeInTheDocument()
    expect(mockApi.get).toHaveBeenCalledWith('/classes')
  })

  it('AC-05.2 lists every class returned by the API', async () => {
    await renderWithClasses([{ id: 'x1', name: 'Kindergarten' }, { id: 'x2', name: 'Grade 9' }])
    expect(screen.getByRole('button', { name: /^Kindergarten/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Grade 9/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Grade 5/ })).not.toBeInTheDocument()
  })

  it('UC-05-E1 shows a loading indicator while the request is pending', async () => {
    const pending = deferred<unknown[]>()
    mockApi.get.mockReturnValue(pending.promise)
    renderPage()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByText('No classes yet.')).not.toBeInTheDocument()

    pending.resolve([grade5])
    expect(await screen.findByRole('button', { name: /^Grade 5/ })).toBeInTheDocument()
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
  })

  it('UC-05-E1 shows a clear error state (and not the empty state) when loading fails', async () => {
    mockApi.get.mockRejectedValue(new TypeError('Failed to fetch'))
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    expect(screen.queryByText('No classes yet.')).not.toBeInTheDocument()
  })

  it('AC-01.1 a valid unique name is POSTed and the class appears in the list without reload', async () => {
    await renderWithClasses([grade5])
    mockApi.post.mockResolvedValue({ id: 'c3', name: 'Grade 7' })

    fireEvent.change(screen.getByLabelText('New class'), { target: { value: 'Grade 7' } })
    fireEvent.click(screen.getByRole('button', { name: /add class/i }))

    expect(await screen.findByRole('button', { name: /^Grade 7/ })).toBeInTheDocument()
    expect(mockApi.post).toHaveBeenCalledWith('/classes', { name: 'Grade 7' })
    expect(screen.getByLabelText('New class')).toHaveValue('')
  })

  it('AC-05.3 class list entries show no section/subject counts (those ship in M2)', async () => {
    await renderWithClasses([grade5, grade6])
    await selectClass('Grade 5') // the still-mocked panels may mention sections/subjects; only list items are checked

    const list = screen.getByRole('heading', { name: /all classes/i }).parentElement!.querySelector('ul')!
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)

    for (const item of items) {
      expect(item.textContent).not.toMatch(/section|subject|·/i)
    }
    expect(within(list).getByRole('button', { name: 'Grade 5' })).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'Grade 6' })).toBeInTheDocument()
  })

  it('UC-01-E3 shows the generic error and keeps the typed text when the backend is unreachable', async () => {
    await renderWithClasses([grade5])
    mockApi.post.mockRejectedValue(new TypeError('Failed to fetch'))

    fireEvent.change(screen.getByLabelText('New class'), { target: { value: 'Grade 7' } })
    fireEvent.click(screen.getByRole('button', { name: /add class/i }))

    expect(await screen.findByText(GENERIC_ERROR)).toBeInTheDocument()
    expect(screen.getByLabelText('New class')).toHaveValue('Grade 7')
    expect(screen.queryByRole('button', { name: /^Grade 7/ })).not.toBeInTheDocument()
  })

  it('AC-02.1 saving a rename PATCHes the class and the list and header show the new name', async () => {
    await renderWithClasses([grade5, grade6])
    await selectClass('Grade 5')
    mockApi.patch.mockResolvedValue({ id: 'c1', name: 'Grade 5A' })

    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    fireEvent.change(screen.getByDisplayValue('Grade 5'), { target: { value: 'Grade 5A' } })
    fireEvent.click(screen.getByRole('button', { name: /^save/i }))

    expect(await screen.findByRole('heading', { name: 'Grade 5A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Grade 5A/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Grade 5(?!A)/ })).not.toBeInTheDocument()
    expect(mockApi.patch).toHaveBeenCalledWith('/classes/c1', { name: 'Grade 5A' })
  })

  it('UC-02-E2 renaming a class deleted elsewhere shows "This class no longer exists." and refreshes the list', async () => {
    await renderWithClasses([grade5, grade6])
    await selectClass('Grade 5')
    mockApi.patch.mockRejectedValue(new ApiError(404, { message: GONE }))
    mockGet({ classes: [grade6] })

    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    fireEvent.change(screen.getByDisplayValue('Grade 5'), { target: { value: 'Grade 5A' } })
    fireEvent.click(screen.getByRole('button', { name: /^save/i }))

    expect(await screen.findByText(GONE)).toBeInTheDocument()
    await waitFor(() => expect(classListCalls()).toBe(2))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Grade 5/ })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^Grade 6/ })).toBeInTheDocument()
    expect(screen.getByText(GONE)).toBeInTheDocument()
  })

  it('UC-02-E3 Save shows a loading state and is disabled until the rename request completes', async () => {
    await renderWithClasses([grade5])
    await selectClass('Grade 5')
    const pending = deferred<{ id: string; name: string }>()
    mockApi.patch.mockReturnValue(pending.promise)

    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    fireEvent.change(screen.getByDisplayValue('Grade 5'), { target: { value: 'Grade 5A' } })
    fireEvent.click(screen.getByRole('button', { name: /^save/i }))

    const saving = await screen.findByRole('button', { name: /sav/i })
    expect(saving).toBeDisabled()
    expect(saving).toHaveTextContent(/saving|\.\.\./i)
    fireEvent.click(saving)
    expect(mockApi.patch).toHaveBeenCalledTimes(1)

    pending.resolve({ id: 'c1', name: 'Grade 5A' })
    expect(await screen.findByRole('heading', { name: 'Grade 5A' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sav/i })).not.toBeInTheDocument()
  })

  it('AC-03.1 confirming delete sends DELETE and the class disappears without reload', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderWithClasses([grade5, grade6])
    await selectClass('Grade 5')
    mockApi.delete.mockResolvedValue(null)

    fireEvent.click(screen.getByRole('button', { name: /delete class/i }))

    await waitFor(() => expect(screen.queryByRole('button', { name: /^Grade 5/ })).not.toBeInTheDocument())
    expect(mockApi.delete).toHaveBeenCalledWith('/classes/c1')
    expect(screen.getByRole('button', { name: /^Grade 6/ })).toBeInTheDocument()
  })

  it('AC-03.3 cancelling the delete confirmation sends no request and keeps the class', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await renderWithClasses([grade5])
    await selectClass('Grade 5')

    fireEvent.click(screen.getByRole('button', { name: /delete class/i }))

    expect(window.confirm).toHaveBeenCalled()
    expect(mockApi.delete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^Grade 5/ })).toBeInTheDocument()
  })

  it('UC-03-E1 deleting an already-deleted class shows "This class no longer exists." and refreshes the list', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderWithClasses([grade5, grade6])
    await selectClass('Grade 5')
    mockApi.delete.mockRejectedValue(new ApiError(404, { message: GONE }))
    mockGet({ classes: [grade6] })

    fireEvent.click(screen.getByRole('button', { name: /delete class/i }))

    expect(await screen.findByText(GONE)).toBeInTheDocument()
    await waitFor(() => expect(classListCalls()).toBe(2))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Grade 5/ })).not.toBeInTheDocument())
    expect(screen.getByText(GONE)).toBeInTheDocument()
  })

  it('UC-03-E2 deleting the last remaining class renders the "No classes yet." empty state', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderWithClasses([grade5])
    await selectClass('Grade 5')
    mockApi.delete.mockResolvedValue(null)

    fireEvent.click(screen.getByRole('button', { name: /delete class/i }))

    expect(await screen.findByText('No classes yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Grade 5/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete class/i })).not.toBeInTheDocument()
  })

  it('UC-03-E3 shows a generic error and keeps the class when delete fails because the backend is unreachable', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderWithClasses([grade5])
    await selectClass('Grade 5')
    mockApi.delete.mockRejectedValue(new TypeError('Failed to fetch'))

    fireEvent.click(screen.getByRole('button', { name: /delete class/i }))

    expect(await screen.findByText(GENERIC_ERROR)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Grade 5/ })).toBeInTheDocument()
  })

  it('AC-04.3 admin (positive control) sees the New class input, Add class, Rename and Delete class controls', async () => {
    await renderWithClasses([grade5])
    await selectClass('Grade 5')

    expect(screen.getByLabelText('New class')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add class/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /rename/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete class/i })).toBeInTheDocument()
  })

  it.each([
    ['teacher', teacher],
    ['student', student],
  ])('AC-04.3 %s does not see the New class input, Add class, Rename or Delete class controls', async (_label, viewer) => {
    // renderWithClasses waits for the list to load; selecting the class makes
    // Rename/Delete class present for an admin, so their absence here is meaningful.
    await renderWithClasses([grade5], { user: viewer })
    await selectClass('Grade 5')
    expect(await screen.findByRole('heading', { name: 'Grade 5' })).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: /add class/i })).toBeNull()
    expect(screen.queryByLabelText('New class')).toBeNull()
    expect(screen.queryByRole('button', { name: /rename/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /delete class/i })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// T-018: sections wired to the real API
// ---------------------------------------------------------------------------

const SECTION_GONE = 'This section no longer exists.'
const teacherGrace = { id: 't1', name: 'Grace Kim' }
const teacherDaniel = { id: 't2', name: 'Daniel Ortiz' }
const sectionA: SectionRow = { id: 's1', name: 'A', classTeacher: null }
const sectionsUrl = '/classes/c1/sections'

async function openGrade5(routes: GetRoutes, overrides = {}) {
  const full: GetRoutes = { classes: [grade5], sections: { c1: [sectionA] }, teachers: [teacherGrace, teacherDaniel], ...routes }
  mockGet(full)
  renderPage(overrides)
  await selectClass('Grade 5')
  return full
}

const sectionLabel = (name: string) => `Grade 5 \u2013 ${name}`
const isHiddenOrDisabled = (el: HTMLElement | null) => el === null || (el as HTMLButtonElement).disabled === true

describe('ClassesPage sections (T-018)', () => {
  it('loads the selected class sections from GET /classes/:id/sections and shows them', async () => {
    await openGrade5({ sections: { c1: [sectionA, { id: 's2', name: 'B', classTeacher: teacherGrace }] } })
    expect(await screen.findByText(sectionLabel('A'))).toBeInTheDocument()
    expect(screen.getByText(sectionLabel('B'))).toBeInTheDocument()
    expect(mockApi.get).toHaveBeenCalledWith(sectionsUrl)
  })

  it('AC-06.1 a valid section name is POSTed and appears under the class immediately', async () => {
    const routes = await openGrade5({})
    await screen.findByText(sectionLabel('A'))
    mockApi.post.mockImplementation(async () => {
      routes.sections!.c1 = [...routes.sections!.c1, { id: 's2', name: 'B', classTeacher: null }]
      return { id: 's2', name: 'B' }
    })

    fireEvent.change(screen.getByPlaceholderText('e.g. C'), { target: { value: 'B' } })
    fireEvent.click(screen.getByRole('button', { name: /add section/i }))

    expect(await screen.findByText(sectionLabel('B'))).toBeInTheDocument()
    expect(screen.getByText(sectionLabel('A'))).toBeInTheDocument()
    expect(mockApi.post).toHaveBeenCalledWith(sectionsUrl, { name: 'B' })
  })

  it('AC-06.3 shows the backend 400 message and adds no section', async () => {
    await openGrade5({})
    await screen.findByText(sectionLabel('A'))
    mockApi.post.mockRejectedValue(new ApiError(400, { message: 'Backend rejected this name.' }))

    fireEvent.change(screen.getByPlaceholderText('e.g. C'), { target: { value: 'Zed' } })
    fireEvent.click(screen.getByRole('button', { name: /add section/i }))

    expect(await screen.findByText('Backend rejected this name.')).toBeInTheDocument()
    expect(screen.queryByText(sectionLabel('Zed'))).not.toBeInTheDocument()
  })

  it('AC-07.1 confirming delete sends DELETE and the section disappears without reload', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const routes = await openGrade5({ sections: { c1: [sectionA, { id: 's2', name: 'B', classTeacher: null }] } })
    await screen.findByText(sectionLabel('A'))
    mockApi.delete.mockImplementation(async () => {
      routes.sections!.c1 = routes.sections!.c1.filter((s) => s.id !== 's1')
      return null
    })

    fireEvent.click(within(screen.getByText(sectionLabel('A')).parentElement!).getByRole('button', { name: /remove/i }))

    await waitFor(() => expect(screen.queryByText(sectionLabel('A'))).not.toBeInTheDocument())
    expect(mockApi.delete).toHaveBeenCalledWith('/classes/c1/sections/s1')
    expect(screen.getByText(sectionLabel('B'))).toBeInTheDocument()
  })

  it('AC-07.2 the delete confirmation says students will be unassigned', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await openGrade5({})
    await screen.findByText(sectionLabel('A'))

    fireEvent.click(screen.getByRole('button', { name: /remove/i }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    const message = String(confirmSpy.mock.calls[0][0])
    expect(message).toMatch(/student/i)
    expect(message).toMatch(/unassign/i)
    expect(mockApi.delete).not.toHaveBeenCalled()
    expect(screen.getByText(sectionLabel('A'))).toBeInTheDocument()
  })

  it('UC-07-E1 deleting an already-deleted section shows "This section no longer exists." and refetches', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const routes = await openGrade5({})
    await screen.findByText(sectionLabel('A'))
    const callsBefore = mockApi.get.mock.calls.filter((c) => c[0] === sectionsUrl).length
    mockApi.delete.mockRejectedValue(new ApiError(404, { message: SECTION_GONE }))
    routes.sections!.c1 = []

    fireEvent.click(screen.getByRole('button', { name: /remove/i }))

    expect(await screen.findByText(SECTION_GONE)).toBeInTheDocument()
    await waitFor(() =>
      expect(mockApi.get.mock.calls.filter((c) => c[0] === sectionsUrl).length).toBeGreaterThan(callsBefore),
    )
    await waitFor(() => expect(screen.queryByText(sectionLabel('A'))).not.toBeInTheDocument())
    expect(screen.getByText(SECTION_GONE)).toBeInTheDocument()
  })

  it('UC-07-E2 deleting the only remaining section renders the "No sections yet." empty state', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const routes = await openGrade5({})
    await screen.findByText(sectionLabel('A'))
    expect(screen.queryByText('No sections yet.')).not.toBeInTheDocument()
    mockApi.delete.mockImplementation(async () => {
      routes.sections!.c1 = []
      return null
    })

    fireEvent.click(screen.getByRole('button', { name: /remove/i }))

    expect(await screen.findByText('No sections yet.')).toBeInTheDocument()
    expect(screen.queryByText(sectionLabel('A'))).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('UC-07-E2 a class that has no sections renders "No sections yet."', async () => {
    await openGrade5({ sections: { c1: [] } })
    expect(await screen.findByText('No sections yet.')).toBeInTheDocument()
  })

  it('AC-08.1 the class-teacher dropdown lists the teachers from GET /users?role=teacher', async () => {
    await openGrade5({})
    await screen.findByText(sectionLabel('A'))
    expect(await screen.findByRole('option', { name: 'Grace Kim' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Daniel Ortiz' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Unassigned' })).toBeInTheDocument()
    expect(mockApi.get).toHaveBeenCalledWith('/users?role=teacher')
  })

  it('AC-08.1 picking a teacher PATCHes the class-teacher URL and the section shows that teacher immediately', async () => {
    await openGrade5({})
    await screen.findByText(sectionLabel('A'))
    await screen.findByRole('option', { name: 'Grace Kim' })
    mockApi.patch.mockResolvedValue({ id: 's1', name: 'A', classTeacherId: 't1' })

    const select = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 't1' } })

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/classes/c1/sections/s1/class-teacher', { teacherId: 't1' }))
    await waitFor(() => expect(select.selectedOptions[0]).toHaveTextContent('Grace Kim'))
    expect(select).toHaveValue('t1')
  })

  it('AC-08.3 picking "Unassigned" sends teacherId: null and clears the class teacher', async () => {
    await openGrade5({ sections: { c1: [{ ...sectionA, classTeacher: teacherGrace }] } })
    await screen.findByText(sectionLabel('A'))
    await screen.findByRole('option', { name: 'Grace Kim' })
    mockApi.patch.mockResolvedValue({ id: 's1', name: 'A', classTeacherId: null })

    const select = screen.getByRole('combobox') as HTMLSelectElement
    await waitFor(() => expect(select).toHaveValue('t1'))
    fireEvent.change(select, { target: { value: '' } })

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/classes/c1/sections/s1/class-teacher', { teacherId: null }))
    await waitFor(() => expect(select).toHaveValue(''))
    expect(select.selectedOptions[0]).toHaveTextContent('Unassigned')
  })

  it('UC-08-E1 with no teacher accounts the dropdown shows only "Unassigned" and does not crash', async () => {
    await openGrade5({ teachers: [] })
    await screen.findByText(sectionLabel('A'))

    const options = within(screen.getByRole('combobox')).getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Unassigned')
  })

  it('AC-12.2 admin (positive control) sees enabled add-section, remove-section and class-teacher controls', async () => {
    await openGrade5({})
    await screen.findByText(sectionLabel('A'))

    expect(screen.getByPlaceholderText('e.g. C')).toBeEnabled()
    expect(screen.getByRole('button', { name: /add section/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /remove/i })).toBeEnabled()
    expect(screen.getByRole('combobox')).toBeEnabled()
  })

  it.each([
    ['teacher', teacher],
    ['student', student],
  ])('AC-12.2 %s sees the sections but no enabled add-section, remove-section or class-teacher controls', async (_label, viewer) => {
    await openGrade5({}, { user: viewer })
    expect(await screen.findByText(sectionLabel('A'))).toBeInTheDocument()

    expect(isHiddenOrDisabled(screen.queryByPlaceholderText('e.g. C'))).toBe(true)
    expect(isHiddenOrDisabled(screen.queryByRole('button', { name: /add section/i }))).toBe(true)
    expect(isHiddenOrDisabled(screen.queryByRole('button', { name: /remove/i }))).toBe(true)
    expect(isHiddenOrDisabled(screen.queryByRole('combobox'))).toBe(true)
  })
})
