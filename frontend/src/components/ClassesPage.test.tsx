import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  // T-019
  subjects?: { id: string; name: string }[]
  classSubjects?: Record<string, ClassSubjectRow[]>
  students?: StudentRow[]
}
interface ClassSubjectRow {
  id: string
  subject: { id: string; name: string }
  teacher: { id: string; name: string } | null
}
interface StudentRow {
  id: string
  name: string
  email: string
  role: 'student'
  sectionId: string | null
}

// T-018: the page now calls api.get for several URLs, so GET is mocked per URL.
// `routes` is read at call time, so tests may mutate it to simulate server state.
function mockGet(routes: GetRoutes) {
  mockApi.get.mockImplementation((url: string) => {
    if (url === '/classes') return Promise.resolve(routes.classes ?? [])
    const sectionsMatch = url.match(/^\/classes\/([^/]+)\/sections$/)
    if (sectionsMatch) return Promise.resolve(routes.sections?.[sectionsMatch[1]] ?? [])
    if (url === '/subjects') return Promise.resolve(routes.subjects ?? [])
    const classSubjectsMatch = url.match(/^\/classes\/([^/]+)\/subjects$/)
    if (classSubjectsMatch) return Promise.resolve(routes.classSubjects?.[classSubjectsMatch[1]] ?? [])
    if (url.startsWith('/users') && url.includes('role=student')) return Promise.resolve(routes.students ?? [])
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

// ---------------------------------------------------------------------------
// T-019: subjects + student assignment wired to the real API
//
// UI contract assumed by these tests:
// - Subjects area: textbox labelled "New subject" + button "Add subject" (POST /subjects).
// - Quick-add list: one button per catalog subject NOT yet on the class, accessible
//   name exactly the subject name (POST /classes/:id/subjects {subjectId}).
// - Class subject rows: select labelled "Teacher for <subject>" (options: teachers
//   + "Unassigned") and button labelled "Remove <subject>".
// - Per section row: button "View roster" opening role="dialog" containing a
//   combobox labelled "Student", an "Assign" button, a list labelled "Roster"
//   whose items show the student name and an "Unassign" button, a "Close" button,
//   and the text "No students yet." when no student accounts exist.
// ---------------------------------------------------------------------------

const maths = { id: 'sub1', name: 'Maths' }
const science = { id: 'sub2', name: 'Science' }
const robotics = { id: 'sub3', name: 'Robotics' }
const sectionB: SectionRow = { id: 's2', name: 'B', classTeacher: null }
const mathsRow: ClassSubjectRow = { id: 'cs1', subject: maths, teacher: null }
const sam: StudentRow = { id: 'u1', name: 'Sam Student', email: 'sam@example.com', role: 'student', sectionId: null }
const priya: StudentRow = { id: 'u2', name: 'Priya Patel', email: 'priya@example.com', role: 'student', sectionId: null }

async function openGrade5T19(routes: GetRoutes, overrides = {}) {
  const full: GetRoutes = {
    classes: [grade5],
    sections: { c1: [sectionA, sectionB] },
    teachers: [teacherGrace, teacherDaniel],
    subjects: [maths, science],
    classSubjects: { c1: [] },
    students: [],
    ...routes,
  }
  mockGet(full)
  renderPage(overrides)
  await selectClass('Grade 5')
  await screen.findByText(sectionLabel('A'))
  return full
}

async function openRoster(sectionName: string) {
  const row = screen.getByText(sectionLabel(sectionName)).parentElement!
  fireEvent.click(within(row).getByRole('button', { name: /view roster/i }))
  return screen.findByRole('dialog')
}

function rosterNames(dialog: HTMLElement) {
  const list = within(dialog).queryByRole('list', { name: /roster/i })
  return list ? within(list).queryAllByRole('listitem').map((li) => li.textContent ?? '') : []
}

// Server-side behavior of PATCH /users/:id/section, applied to the mutable routes.
function mockSectionPatch(routes: GetRoutes) {
  mockApi.patch.mockImplementation(async (url: string, body: { sectionId: string | null }) => {
    const id = url.match(/^\/users\/([^/]+)\/section$/)![1]
    const target = routes.students!.find((st) => st.id === id)!
    target.sectionId = body.sectionId
    return { ...target }
  })
}

describe('ClassesPage subjects + students (T-019)', () => {
  it('loads the catalog from GET /subjects and the class subjects from GET /classes/:id/subjects', async () => {
    await openGrade5T19({ classSubjects: { c1: [mathsRow] } })
    expect(await screen.findByRole('button', { name: 'Remove Maths' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Science' })).toBeInTheDocument()
    expect(mockApi.get).toHaveBeenCalledWith('/subjects')
    expect(mockApi.get).toHaveBeenCalledWith('/classes/c1/subjects')
  })

  it('AC-09.1 a new catalog subject is POSTed, shown in the catalog and selectable for the class', async () => {
    const routes = await openGrade5T19({})
    await screen.findByRole('button', { name: 'Science' })
    mockApi.post.mockImplementation(async (url: string) => {
      if (url === '/subjects') {
        routes.subjects = [...routes.subjects!, robotics]
        return robotics
      }
      const row = { id: 'cs9', subject: robotics, teacher: null }
      routes.classSubjects!.c1 = [...routes.classSubjects!.c1, row]
      return row
    })

    fireEvent.change(screen.getByLabelText('New subject'), { target: { value: 'Robotics' } })
    fireEvent.click(screen.getByRole('button', { name: /^add subject$/i }))

    const quickAdd = await screen.findByRole('button', { name: 'Robotics' })
    expect(mockApi.post).toHaveBeenCalledWith('/subjects', { name: 'Robotics' })
    expect(screen.getByLabelText('New subject')).toHaveValue('')

    fireEvent.click(quickAdd)
    expect(await screen.findByRole('button', { name: 'Remove Robotics' })).toBeInTheDocument()
    expect(mockApi.post).toHaveBeenCalledWith('/classes/c1/subjects', { subjectId: 'sub3' })
  })

  it('AC-09.2 shows "Please enter a subject name." and adds nothing when the name is empty', async () => {
    await openGrade5T19({})
    await screen.findByRole('button', { name: 'Science' })
    mockApi.post.mockRejectedValue(new ApiError(400, { message: 'Please enter a subject name.' }))

    fireEvent.click(screen.getByRole('button', { name: /^add subject$/i }))

    expect(await screen.findByText('Please enter a subject name.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^(Maths|Science)$/ })).toHaveLength(2)
  })

  it('AC-09.3 shows "This subject already exists." and adds nothing for a duplicate name', async () => {
    await openGrade5T19({})
    await screen.findByRole('button', { name: 'Science' })
    mockApi.post.mockRejectedValue(new ApiError(400, { message: 'This subject already exists.' }))

    fireEvent.change(screen.getByLabelText('New subject'), { target: { value: 'maths' } })
    fireEvent.click(screen.getByRole('button', { name: /^add subject$/i }))

    expect(await screen.findByText('This subject already exists.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^(Maths|Science)$/ })).toHaveLength(2)
  })

  it('AC-10.1 adding a subject to a class POSTs it and shows it in the class subject list immediately', async () => {
    const routes = await openGrade5T19({})
    await screen.findByRole('button', { name: 'Science' })
    expect(screen.queryByRole('button', { name: 'Remove Science' })).not.toBeInTheDocument()
    mockApi.post.mockImplementation(async () => {
      const row = { id: 'cs2', subject: science, teacher: null }
      routes.classSubjects!.c1 = [row]
      return row
    })

    fireEvent.click(screen.getByRole('button', { name: 'Science' }))

    expect(await screen.findByRole('button', { name: 'Remove Science' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Teacher for Science' })).toBeInTheDocument()
    expect(mockApi.post).toHaveBeenCalledWith('/classes/c1/subjects', { subjectId: 'sub2' })
  })

  it('AC-10.4 a subject already on the class is not offered in the quick-add list again', async () => {
    await openGrade5T19({ classSubjects: { c1: [mathsRow] } })
    expect(await screen.findByRole('button', { name: 'Remove Maths' })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Science' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Maths' })).not.toBeInTheDocument()
  })

  it('AC-10.4 once every catalog subject is on the class the quick-add list offers nothing', async () => {
    const routes = await openGrade5T19({})
    await screen.findByRole('button', { name: 'Science' })
    mockApi.post.mockImplementation(async (_url: string, body: { subjectId: string }) => {
      const subject = routes.subjects!.find((x) => x.id === body.subjectId)!
      const row = { id: `cs-${subject.id}`, subject, teacher: null }
      routes.classSubjects!.c1 = [...routes.classSubjects!.c1, row]
      return row
    })

    fireEvent.click(screen.getByRole('button', { name: 'Maths' }))
    await screen.findByRole('button', { name: 'Remove Maths' })
    expect(screen.queryByRole('button', { name: 'Maths' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Science' })).toBeInTheDocument()
  })

  it('AC-10.3 the teacher dropdown lists only the teachers from GET /users?role=teacher (plus Unassigned)', async () => {
    await openGrade5T19({ classSubjects: { c1: [mathsRow] }, students: [sam] })
    const select = await screen.findByRole('combobox', { name: 'Teacher for Maths' })

    const names = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(names).toEqual(['Unassigned', 'Grace Kim', 'Daniel Ortiz'])
    expect(mockApi.get).toHaveBeenCalledWith('/users?role=teacher')
  })

  it('AC-10.2 picking a new teacher PATCHes the class-subject teacher and shows it (replacing the old one)', async () => {
    await openGrade5T19({ classSubjects: { c1: [{ ...mathsRow, teacher: teacherGrace }] } })
    const select = (await screen.findByRole('combobox', { name: 'Teacher for Maths' })) as HTMLSelectElement
    await waitFor(() => expect(select).toHaveValue('t1'))
    mockApi.patch.mockResolvedValue({ id: 'cs1', subject: maths, teacher: teacherDaniel })

    fireEvent.change(select, { target: { value: 't2' } })

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/classes/c1/subjects/cs1/teacher', { teacherId: 't2' }))
    await waitFor(() => expect(select).toHaveValue('t2'))
    expect(select.selectedOptions[0]).toHaveTextContent('Daniel Ortiz')
  })

  it('UC-10-E1 picking "Unassigned" sends teacherId: null and the subject stays on the class', async () => {
    await openGrade5T19({ classSubjects: { c1: [{ ...mathsRow, teacher: teacherGrace }] } })
    const select = (await screen.findByRole('combobox', { name: 'Teacher for Maths' })) as HTMLSelectElement
    await waitFor(() => expect(select).toHaveValue('t1'))
    mockApi.patch.mockResolvedValue({ id: 'cs1', subject: maths, teacher: null })

    fireEvent.change(select, { target: { value: '' } })

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/classes/c1/subjects/cs1/teacher', { teacherId: null }))
    await waitFor(() => expect(select).toHaveValue(''))
    expect(screen.getByRole('button', { name: 'Remove Maths' })).toBeInTheDocument()
  })

  it('AC-11.1 assigning a student to a section PATCHes /users/:id/section and shows them in that roster immediately', async () => {
    const routes = await openGrade5T19({ students: [{ ...sam }, { ...priya }] })
    mockSectionPatch(routes)
    const dialog = await openRoster('A')
    expect(rosterNames(dialog)).toEqual([])

    fireEvent.change(await within(dialog).findByRole('combobox', { name: /student/i }), { target: { value: 'u1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }))

    await waitFor(() => expect(rosterNames(dialog)).toEqual([expect.stringContaining('Sam Student')]))
    expect(mockApi.patch).toHaveBeenCalledWith('/users/u1/section', { sectionId: 's1' })
    expect(rosterNames(dialog).join()).not.toContain('Priya Patel')
  })

  it('AC-11.1 the roster shows students already assigned to the section when it is opened', async () => {
    await openGrade5T19({ students: [{ ...sam, sectionId: 's1' }, { ...priya, sectionId: 's2' }] })
    const dialog = await openRoster('A')

    await waitFor(() => expect(rosterNames(dialog)).toHaveLength(1))
    expect(rosterNames(dialog)[0]).toContain('Sam Student')
  })

  it('AC-11.2 reassigning a student moves them out of the old section roster and into the new one', async () => {
    const routes = await openGrade5T19({ students: [{ ...sam, sectionId: 's1' }] })
    mockSectionPatch(routes)

    let dialog = await openRoster('B')
    expect(rosterNames(dialog)).toEqual([])
    fireEvent.change(await within(dialog).findByRole('combobox', { name: /student/i }), { target: { value: 'u1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }))
    await waitFor(() => expect(rosterNames(dialog)).toHaveLength(1))
    expect(mockApi.patch).toHaveBeenCalledWith('/users/u1/section', { sectionId: 's2' })

    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    dialog = await openRoster('A')
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: /student/i })).toBeInTheDocument())
    expect(rosterNames(dialog)).toEqual([])
  })

  it('UC-11-E2 unassigning sends sectionId: null and removes the student from the roster without deleting them', async () => {
    const routes = await openGrade5T19({ students: [{ ...sam, sectionId: 's1' }] })
    mockSectionPatch(routes)
    const dialog = await openRoster('A')
    await waitFor(() => expect(rosterNames(dialog)).toHaveLength(1))

    fireEvent.click(within(dialog).getByRole('button', { name: /unassign/i }))

    await waitFor(() => expect(rosterNames(dialog)).toEqual([]))
    expect(mockApi.patch).toHaveBeenCalledWith('/users/u1/section', { sectionId: null })
    expect(mockApi.delete).not.toHaveBeenCalled()
  })

  it('UC-11-E1 with no student accounts the picker shows an empty state and does not crash', async () => {
    await openGrade5T19({ students: [] })
    const dialog = await openRoster('A')

    expect(await within(dialog).findByText('No students yet.')).toBeInTheDocument()
    const assign = within(dialog).queryByRole('button', { name: /^assign$/i })
    expect(assign === null || (assign as HTMLButtonElement).disabled).toBe(true)
    expect(rosterNames(dialog)).toEqual([])
    expect(mockApi.get).toHaveBeenCalledWith('/users?role=student')
  })

  it('AC-12.2 admin (positive control) sees enabled subject, teacher, roster-assign and unassign controls', async () => {
    await openGrade5T19({ classSubjects: { c1: [mathsRow] }, students: [{ ...sam, sectionId: 's1' }, { ...priya }] })

    expect(await screen.findByLabelText('New subject')).toBeEnabled()
    expect(screen.getByRole('button', { name: /^add subject$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Science' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Remove Maths' })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Teacher for Maths' })).toBeEnabled()

    const dialog = await openRoster('A')
    await waitFor(() => expect(rosterNames(dialog)).toHaveLength(1))
    expect(within(dialog).getByRole('combobox', { name: /student/i })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: /^assign$/i })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: /unassign/i })).toBeEnabled()
  })

  it.each([
    ['teacher', teacher],
    ['student', student],
  ])('AC-12.2 %s sees the subjects but no enabled subject or student-assignment write controls', async (_label, viewer) => {
    await openGrade5T19(
      { classSubjects: { c1: [mathsRow] }, students: [{ ...sam, sectionId: 's1' }, { ...priya }] },
      { user: viewer },
    )
    expect(await screen.findByText('Maths')).toBeInTheDocument()

    expect(isHiddenOrDisabled(screen.queryByLabelText('New subject'))).toBe(true)
    expect(isHiddenOrDisabled(screen.queryByRole('button', { name: /^add subject$/i }))).toBe(true)
    expect(isHiddenOrDisabled(screen.queryByRole('button', { name: 'Science' }))).toBe(true)
    expect(isHiddenOrDisabled(screen.queryByRole('button', { name: 'Remove Maths' }))).toBe(true)
    expect(isHiddenOrDisabled(screen.queryByRole('combobox', { name: 'Teacher for Maths' }))).toBe(true)

    // If the roster can still be opened read-only, it must not offer write controls.
    const viewRoster = screen.queryAllByRole('button', { name: /view roster/i })[0]
    if (viewRoster && !(viewRoster as HTMLButtonElement).disabled) {
      fireEvent.click(viewRoster)
      const dialog = await screen.findByRole('dialog')
      expect(isHiddenOrDisabled(within(dialog).queryByRole('combobox', { name: /student/i }))).toBe(true)
      expect(isHiddenOrDisabled(within(dialog).queryByRole('button', { name: /^assign$/i }))).toBe(true)
      expect(isHiddenOrDisabled(within(dialog).queryByRole('button', { name: /unassign/i }))).toBe(true)
    }
  })

  // @testing-library/user-event is not installed, so Escape is sent with
  // fireEvent.keyDown to the focused element (what userEvent.keyboard does).
  const pressEscapeOnFocused = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' })

  async function openRosterViaButton() {
    await openGrade5T19({ students: [{ ...sam, sectionId: 's1' }] })
    const row = screen.getByText(sectionLabel('A')).parentElement!
    const trigger = within(row).getByRole('button', { name: /view roster/i })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog')
    return { trigger, dialog }
  }

  it('roster dialog moves focus into the dialog when opened', async () => {
    const { dialog } = await openRosterViaButton()

    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    expect(document.activeElement).not.toBe(document.body)
  })

  it('roster dialog closes on Escape sent to the focused element and returns focus to "View roster"', async () => {
    const { trigger } = await openRosterViaButton()
    await waitFor(() => expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true))

    pressEscapeOnFocused()

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('roster dialog closes with the Close button and returns focus to "View roster"', async () => {
    const { trigger, dialog } = await openRosterViaButton()
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('AC-10.4 when GET /classes/:id/subjects fails, no quick-add buttons are offered and an alert is shown', async () => {
    const routes: GetRoutes = {
      classes: [grade5],
      sections: { c1: [sectionA, sectionB] },
      teachers: [teacherGrace, teacherDaniel],
      subjects: [maths, science],
      students: [],
    }
    mockGet(routes)
    const base = mockApi.get.getMockImplementation() as (url: string) => Promise<unknown>
    mockApi.get.mockImplementation((url: string) =>
      url === '/classes/c1/subjects' ? Promise.reject(new TypeError('Failed to fetch')) : base(url),
    )
    renderPage()
    await selectClass('Grade 5')
    await screen.findByText(sectionLabel('A'))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/subjects'))
    expect(screen.queryByRole('button', { name: 'Maths' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Science' })).not.toBeInTheDocument()
  })

  it('AC-10.4 while class subjects are still loading, no quick-add buttons are offered', async () => {
    const routes: GetRoutes = {
      classes: [grade5],
      sections: { c1: [sectionA, sectionB] },
      teachers: [teacherGrace, teacherDaniel],
      subjects: [maths, science],
      students: [],
    }
    mockGet(routes)
    const base = mockApi.get.getMockImplementation() as (url: string) => Promise<unknown>
    const pending = deferred<ClassSubjectRow[]>()
    let subjectsSettled: Promise<unknown> = Promise.resolve()
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/classes/c1/subjects') return pending.promise
      const result = base(url)
      if (url === '/subjects') subjectsSettled = Promise.resolve(result).catch(() => undefined)
      return result
    })
    renderPage()
    await selectClass('Grade 5')
    await screen.findByText(sectionLabel('A'))
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/classes/c1/subjects'))
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/subjects'))
    // Deterministic: wait until the /subjects response has settled and React has flushed its update.
    await act(async () => {
      await subjectsSettled
    })

    expect(screen.queryByRole('button', { name: 'Maths' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Science' })).not.toBeInTheDocument()

    pending.resolve([mathsRow])
    expect(await screen.findByRole('button', { name: 'Science' })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// T-027: subject catalog rename + delete
//
// UI contract the implementation must follow:
//  - A "Manage subjects" area (admin only) lists every catalog subject, each
//    with buttons named "Rename <name>" and "Delete <name>".
//  - Rename opens an inline input labelled "Subject name" (prefilled with the
//    current name) with "Save" and "Cancel" buttons. Save with an empty/blank
//    value shows "Please enter a subject name." without sending a request.
//    Otherwise it calls api.patch(`/subjects/${id}`, { name }).
//  - Delete calls window.confirm, then api.delete(`/subjects/${id}`).
//  - ApiError messages (400) are shown as text; a 404 shows
//    "This subject no longer exists." and refetches GET /subjects.
//  - After a successful rename the catalog and the class's subject list
//    (e.g. "Remove <new name>", "Teacher for <new name>") show the new name.
// ---------------------------------------------------------------------------

describe('ClassesPage subject catalog rename/delete (T-027)', () => {
  const SUBJECT_GONE = 'This subject no longer exists.'
  const subjectsFetchCount = () => mockApi.get.mock.calls.filter((c) => c[0] === '/subjects').length

  async function openCatalog(routes: GetRoutes = {}, overrides = {}) {
    const full = await openGrade5T19(routes, overrides)
    await screen.findByRole('button', { name: 'Rename Science' })
    return full
  }

  async function startRename(name: string, value: string) {
    fireEvent.click(screen.getByRole('button', { name: `Rename ${name}` }))
    fireEvent.change(await screen.findByLabelText('Subject name'), { target: { value } })
  }

  const clickSave = () => fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

  it('AC-22.1 a rename PATCHes /subjects/:id and the new name shows in the catalog and the class subject list', async () => {
    const routes = await openCatalog({ classSubjects: { c1: [mathsRow] } })
    expect(await screen.findByRole('button', { name: 'Remove Maths' })).toBeInTheDocument()
    mockApi.patch.mockImplementation(async (_url: string, body: { name: string }) => {
      const renamed = { id: 'sub1', name: body.name }
      routes.subjects = routes.subjects!.map((s) => (s.id === 'sub1' ? renamed : s))
      routes.classSubjects!.c1 = [{ ...mathsRow, subject: renamed }]
      return renamed
    })

    await startRename('Maths', 'Mathematics')
    clickSave()

    expect(await screen.findByRole('button', { name: 'Rename Mathematics' })).toBeInTheDocument()
    expect(mockApi.patch).toHaveBeenCalledWith('/subjects/sub1', { name: 'Mathematics' })
    expect(screen.getByRole('button', { name: 'Delete Mathematics' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Mathematics' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Teacher for Mathematics' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename Maths' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Maths' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Subject name')).not.toBeInTheDocument()
  })

  it('AC-22.2 the backend "Please enter a subject name." message is shown and the original name is kept', async () => {
    await openCatalog({ classSubjects: { c1: [mathsRow] } })
    mockApi.patch.mockRejectedValue(new ApiError(400, { message: 'Please enter a subject name.' }))

    await startRename('Maths', 'x')
    clickSave()

    expect(await screen.findByText('Please enter a subject name.')).toBeInTheDocument()
    expect(mockApi.patch).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Remove Maths' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.getByRole('button', { name: 'Rename Maths' })).toBeInTheDocument()
  })

  it('AC-22.2 clearing the name and saving shows the message without sending a request and keeps the name', async () => {
    await openCatalog({ classSubjects: { c1: [mathsRow] } })

    await startRename('Maths', '')
    clickSave()

    expect(await screen.findByText('Please enter a subject name.')).toBeInTheDocument()
    expect(mockApi.patch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Remove Maths' })).toBeInTheDocument()
  })

  it('AC-22.3 a duplicate name shows "This subject already exists." and the name is not changed', async () => {
    await openCatalog({ classSubjects: { c1: [mathsRow] } })
    mockApi.patch.mockRejectedValue(new ApiError(400, { message: 'This subject already exists.' }))

    await startRename('Maths', 'science')
    clickSave()

    expect(await screen.findByText('This subject already exists.')).toBeInTheDocument()
    expect(mockApi.patch).toHaveBeenCalledWith('/subjects/sub1', { name: 'science' })
    expect(screen.getByRole('button', { name: 'Remove Maths' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename Science' })).toBeInTheDocument()
  })

  it('AC-22.4 confirming delete of an unused subject sends DELETE and removes it from the catalog and quick-add list', async () => {
    const routes = await openCatalog({ classSubjects: { c1: [mathsRow] } })
    expect(screen.getByRole('button', { name: 'Science' })).toBeInTheDocument()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockApi.delete.mockImplementation(async () => {
      routes.subjects = routes.subjects!.filter((s) => s.id !== 'sub2')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Science' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete Science' })).not.toBeInTheDocument())
    expect(mockApi.delete).toHaveBeenCalledWith('/subjects/sub2')
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Rename Science' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Science' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename Maths' })).toBeInTheDocument()
  })

  it('AC-22.5 deleting an in-use subject shows the backend message and the subject remains', async () => {
    await openCatalog({ classSubjects: { c1: [mathsRow] } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockApi.delete.mockRejectedValue(new ApiError(400, { message: "This subject is in use and can't be deleted." }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete Maths' }))

    expect(await screen.findByText("This subject is in use and can't be deleted.")).toBeInTheDocument()
    expect(mockApi.delete).toHaveBeenCalledWith('/subjects/sub1')
    expect(screen.getByRole('button', { name: 'Delete Maths' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Maths' })).toBeInTheDocument()
  })

  it('AC-22.6 cancelling the delete confirmation sends no DELETE and keeps the subject', async () => {
    await openCatalog()
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Science' }))

    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(mockApi.delete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete Science' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Science' })).toBeInTheDocument()
  })

  it('UC-22-E2 a 404 on rename shows "This subject no longer exists." and refetches GET /subjects', async () => {
    const routes = await openCatalog()
    mockApi.patch.mockImplementation(async () => {
      routes.subjects = routes.subjects!.filter((s) => s.id !== 'sub2')
      throw new ApiError(404, { message: SUBJECT_GONE })
    })
    const before = subjectsFetchCount()

    await startRename('Science', 'Physics')
    clickSave()

    expect(await screen.findByText(SUBJECT_GONE)).toBeInTheDocument()
    await waitFor(() => expect(subjectsFetchCount()).toBeGreaterThan(before))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Rename Science' })).not.toBeInTheDocument())
  })

  it('UC-22-E2 a 404 on delete shows "This subject no longer exists." and refetches GET /subjects', async () => {
    const routes = await openCatalog()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockApi.delete.mockImplementation(async () => {
      routes.subjects = routes.subjects!.filter((s) => s.id !== 'sub2')
      throw new ApiError(404, { message: SUBJECT_GONE })
    })
    const before = subjectsFetchCount()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Science' }))

    expect(await screen.findByText(SUBJECT_GONE)).toBeInTheDocument()
    await waitFor(() => expect(subjectsFetchCount()).toBeGreaterThan(before))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete Science' })).not.toBeInTheDocument())
  })

  it('AC-12.2 admin (positive control) sees enabled Rename and Delete buttons for every catalog subject', async () => {
    await openCatalog()

    for (const name of ['Maths', 'Science']) {
      expect(screen.getByRole('button', { name: `Rename ${name}` })).toBeEnabled()
      expect(screen.getByRole('button', { name: `Delete ${name}` })).toBeEnabled()
    }
  })

  it.each([
    ['teacher', teacher],
    ['student', student],
  ])('AC-12.2 %s sees no enabled catalog Rename or Delete controls', async (_label, viewer) => {
    await openGrade5T19({ classSubjects: { c1: [mathsRow] } }, { user: viewer })
    expect(await screen.findByText('Maths')).toBeInTheDocument()

    for (const name of ['Maths', 'Science']) {
      expect(isHiddenOrDisabled(screen.queryByRole('button', { name: `Rename ${name}` }))).toBe(true)
      expect(isHiddenOrDisabled(screen.queryByRole('button', { name: `Delete ${name}` }))).toBe(true)
    }
  })
})
