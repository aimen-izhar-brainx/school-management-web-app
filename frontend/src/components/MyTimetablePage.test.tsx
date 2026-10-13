import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { MyTimetablePage } from './MyTimetablePage'
import type { AuthUser } from '../lib/auth'
import { api, ApiError } from '../lib/http'

// T-025: MyTimetablePage is wired to GET /timetable/me (T-024). The HTTP layer is mocked; ApiError stays real.
//
// UI CONTRACT the implementation must satisfy:
//  - The page makes exactly one data call per mount: api.get('/timetable/me'). The rendering branch is chosen by
//    the response `kind` (and `section`), NOT by user.role.
//  - Keeps DashboardShell: banner with "Brainx School", only a "Sign out" button, "Back to dashboard",
//    <h1>"My timetable"</h1>, content inside a `.max-w-6xl` wrapper.
//  - Loading: while the request is pending, text matching /loading/i is shown and no grid (table) is rendered.
//  - Failure (request rejects): an element with role="alert" containing exactly "Something went wrong. Please try again."
//    and no grid.
//  - Grid (reuse TimetableGrid read-only): a <table>; row 0 = header, rows 1..7 follow `periods` order.
//    A teaching row contains the period label and formatTime(start)/formatTime(end). The Recess row is one
//    full-width cell (colspan 6) with the amber break styling, Coffee icon, label and time range.
//  - Teacher cell (kind 'teacher'): a cell's textContent contains `${subject.name} — ${class.name}-${section.name}`
//    (em dash U+2014 with single spaces, class and section joined by a hyphen with no spaces), e.g.
//    "Mathematics — Grade 5-A". Cells are located by row (period) and column (day: Monday..Friday = cells 1..5
//    after the row-header cell; use the column header order).
//  - Student cell (kind 'student'): the cell contains the subject name and the teacher name as text.
//  - Empty states (the message is shown as plain text; the grid may or may not also render, tests do not care):
//      teacher with entries === []                  -> "No classes scheduled yet."
//      student with a section and entries === []    -> "Your class's timetable hasn't been set up yet."
//      student with section === null                -> "You haven't been assigned to a class section yet. Contact your school admin."
//                                                      (and NO grid/table is rendered in this case)
//    None of these are role="alert".
//  - Read-only: no combobox, no input, no <button> inside the page's <main> content (the only buttons are the shell's
//    "Back to dashboard"/"Sign out"), and no "Clear ..." / "Add ..." / "Edit ..." / "Remove ..." controls.
vi.mock('../lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/http')>()
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  }
})

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const studentUser: AuthUser = { id: 'student-1', name: 'Jamie Student', email: 'jamie@example.com', role: 'student' }
const teacherUser: AuthUser = { id: 'teacher-1', name: 'Tina Teacher', email: 'tina@example.com', role: 'teacher' }

const parentUser: AuthUser = { id: 'parent-1', name: 'Pat Parent', email: 'pat@example.com', role: 'parent' }

const PERIODS = [
  { id: 'period-1', order: 1, label: 'Period 1', startTime: '08:00', endTime: '08:45', isBreak: false },
  { id: 'period-2', order: 2, label: 'Period 2', startTime: '08:45', endTime: '09:30', isBreak: false },
  { id: 'period-3', order: 3, label: 'Period 3', startTime: '09:30', endTime: '10:15', isBreak: false },
  { id: 'recess', order: 4, label: 'Recess', startTime: '10:15', endTime: '10:45', isBreak: true },
  { id: 'period-4', order: 5, label: 'Period 4', startTime: '10:45', endTime: '11:30', isBreak: false },
  { id: 'period-5', order: 6, label: 'Period 5', startTime: '11:30', endTime: '12:15', isBreak: false },
  { id: 'period-6', order: 7, label: 'Period 6', startTime: '12:15', endTime: '13:00', isBreak: false },
]
const PERIOD_ROW: Record<string, number> = Object.fromEntries(PERIODS.map((p, i) => [p.id, i + 1]))
const DAY_COL: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 }

const MATH = { id: 'sub-math', name: 'Mathematics' }
const SCIENCE = { id: 'sub-sci', name: 'Science' }
const ART = { id: 'sub-art', name: 'Art' }
const DANIEL = { id: 't-daniel', name: 'Daniel Ortiz' }
const MARCUS = { id: 't-marcus', name: 'Marcus Webb' }

const TEACHER_RESPONSE = {
  kind: 'teacher',
  periods: PERIODS,
  entries: [
    {
      id: 'e1',
      periodId: 'period-1',
      dayOfWeek: 'mon',
      subject: MATH,
      section: { id: 's5a', name: 'A' },
      class: { id: 'c5', name: 'Grade 5' },
    },
    {
      id: 'e2',
      periodId: 'period-2',
      dayOfWeek: 'tue',
      subject: MATH,
      section: { id: 's6b', name: 'B' },
      class: { id: 'c6', name: 'Grade 6' },
    },
  ],
}

const STUDENT_RESPONSE = {
  kind: 'student',
  section: { id: 's5a', name: 'A', className: 'Grade 5' },
  periods: PERIODS,
  entries: [
    { id: 'e1', periodId: 'period-1', dayOfWeek: 'mon', subject: MATH, teacher: DANIEL },
    { id: 'e2', periodId: 'period-4', dayOfWeek: 'fri', subject: SCIENCE, teacher: MARCUS },
  ],
}

function renderPage(user: AuthUser = studentUser) {
  const props = { user, onBack: vi.fn(), onSignOut: vi.fn() }
  const view = render(<MyTimetablePage {...props} />)
  return { props, ...view }
}

function cellAt(periodId: string, day: string) {
  const row = screen.getAllByRole('row')[PERIOD_ROW[periodId]]
  // Teaching rows: [row header (th), Mon..Fri cells]. getAllByRole('cell') excludes the th row header.
  return within(row).getAllByRole('cell')[DAY_COL[day] - 1]
}

function expectReadOnly() {
  const main = screen.getByRole('main')
  expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  expect(main.querySelectorAll('select, input, textarea')).toHaveLength(0)
  // The only button allowed in <main> is the shell's "Back to dashboard" navigation.
  for (const button of within(main).queryAllByRole('button')) {
    expect(button).toHaveAccessibleName(/back to dashboard/i)
  }
  // Nothing inside the timetable grid itself is interactive.
  for (const table of screen.queryAllByRole('table')) {
    expect(table.querySelectorAll('select, input, textarea, button')).toHaveLength(0)
  }
  expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^(add|edit|remove|delete)/i })).not.toBeInTheDocument()
  expect(mockApi.post).not.toHaveBeenCalled()
  expect(mockApi.put).not.toHaveBeenCalled()
  expect(mockApi.patch).not.toHaveBeenCalled()
  expect(mockApi.delete).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('MyTimetablePage shell (T-004 regression, now with the real API)', () => {
  beforeEach(() => {
    mockApi.get.mockResolvedValue(STUDENT_RESPONSE)
  })

  it('AC-01.1 header shows the GraduationCap icon and "Brainx School" text', async () => {
    renderPage()
    await screen.findByRole('table')
    const header = screen.getByRole('banner')

    expect(within(header).getByText('Brainx School')).toBeInTheDocument()
    expect(document.querySelectorAll('.lucide-graduation-cap').length).toBeGreaterThan(0)
  })

  it('AC-01.2 header shows only a Sign out button, with no Profile button', async () => {
    const { props } = renderPage()
    await screen.findByRole('table')
    const header = screen.getByRole('banner')

    const signOutButton = within(header).getByRole('button', { name: /sign out/i })
    expect(within(header).queryByRole('button', { name: /^profile$/i })).not.toBeInTheDocument()

    fireEvent.click(signOutButton)
    expect(props.onSignOut).toHaveBeenCalledTimes(1)
  })

  it('AC-01.5 clicking "Back to dashboard" calls onBack', async () => {
    const { props } = renderPage()
    await screen.findByRole('table')
    fireEvent.click(screen.getByText(/back to dashboard/i))
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })

  it('own addition: shows the "My timetable" heading inside the max-w-6xl content width', async () => {
    renderPage()
    await screen.findByRole('table')
    const heading = screen.getByRole('heading', { name: /^my timetable$/i })
    expect(heading.closest('.max-w-6xl')).not.toBeNull()
  })
})

describe('MyTimetablePage loading and failure', () => {
  it('own addition: requests GET /timetable/me exactly once on mount', async () => {
    mockApi.get.mockResolvedValue(STUDENT_RESPONSE)
    renderPage()
    await screen.findByRole('table')
    expect(mockApi.get).toHaveBeenCalledTimes(1)
    expect(mockApi.get).toHaveBeenCalledWith('/timetable/me')
  })

  it('own addition: shows a loading state and no grid while the request is pending', async () => {
    let resolve!: (value: unknown) => void
    mockApi.get.mockReturnValue(new Promise((r) => (resolve = r)))
    renderPage()

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    resolve(STUDENT_RESPONSE)
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
  })

  it('own addition: shows "Something went wrong. Please try again." in an alert when the request fails', async () => {
    mockApi.get.mockRejectedValue(new ApiError(500, { message: 'boom' }))
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('own addition: a network failure (non-ApiError) shows the same generic alert', async () => {
    mockApi.get.mockRejectedValue(new Error('network down'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
  })
})

describe('MyTimetablePage grid structure (T-008 break-row regression, real periods)', () => {
  it('AC-04.1 renders 7 period rows after the header, with Recess as a full-width amber break row', async () => {
    mockApi.get.mockResolvedValue(STUDENT_RESPONSE)
    renderPage()
    await screen.findByRole('table')

    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(8) // header + 7

    const breakRow = rows[PERIOD_ROW.recess]
    expect(breakRow.className).toContain('bg-amber-50/60')
    const cells = within(breakRow).getAllByRole('cell')
    expect(cells).toHaveLength(1)
    expect(cells[0]).toHaveAttribute('colspan', '6')
    expect(breakRow.textContent).toContain('Recess')
    expect(breakRow.textContent).toContain('10:15 AM')
    expect(breakRow.textContent).toContain('10:45 AM')
    expect(breakRow.querySelector('.lucide-coffee')).not.toBeNull()
  })

  it('own addition: shows the Monday-Friday column headers and each teaching period label with its times', async () => {
    mockApi.get.mockResolvedValue(STUDENT_RESPONSE)
    renderPage()
    await screen.findByRole('table')

    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      expect(screen.getByRole('columnheader', { name: day })).toBeInTheDocument()
    }
    const rows = screen.getAllByRole('row')
    expect(rows[PERIOD_ROW['period-1']].textContent).toContain('Period 1')
    expect(rows[PERIOD_ROW['period-1']].textContent).toContain('8:00 AM')
    expect(rows[PERIOD_ROW['period-1']].textContent).toContain('8:45 AM')
    expect(rows[PERIOD_ROW['period-6']].textContent).toContain('Period 6')
    expect(rows[PERIOD_ROW['period-6']].textContent).toContain('12:15 PM')
    expect(rows[PERIOD_ROW['period-6']].textContent).toContain('1:00 PM')
  })
})

describe('MyTimetablePage as a teacher (UC-18)', () => {
  beforeEach(() => {
    mockApi.get.mockResolvedValue(TEACHER_RESPONSE)
  })

  it('AC-18.1 shows entries from two different sections on one grid as "Subject — Class-Section"', async () => {
    renderPage(teacherUser)
    await screen.findByRole('table')
    expect(screen.getAllByRole('table')).toHaveLength(1)

    expect(cellAt('period-1', 'mon').textContent).toContain('Mathematics — Grade 5-A')
    expect(cellAt('period-2', 'tue').textContent).toContain('Mathematics — Grade 6-B')
  })

  it('AC-18.1 places each entry only in its own period/day cell and leaves the others empty', async () => {
    renderPage(teacherUser)
    await screen.findByRole('table')

    expect(cellAt('period-1', 'tue').textContent).toBe('')
    expect(cellAt('period-2', 'mon').textContent).toBe('')
    expect(cellAt('period-6', 'fri').textContent).toBe('')
  })

  it('AC-18.1 renders from the response kind, not user.role (a student-role user receiving a teacher payload sees sections)', async () => {
    renderPage(studentUser)
    await screen.findByRole('table')
    expect(cellAt('period-1', 'mon').textContent).toContain('Mathematics — Grade 5-A')
  })

  it('AC-18.2 shows "No classes scheduled yet." (not an error) when the teacher has no entries', async () => {
    mockApi.get.mockResolvedValue({ kind: 'teacher', periods: PERIODS, entries: [] })
    renderPage(teacherUser)

    expect(await screen.findByText('No classes scheduled yet.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('AC-18.2 does not show the "No classes scheduled yet." message when the teacher has entries', async () => {
    renderPage(teacherUser)
    await screen.findByRole('table')
    expect(screen.queryByText('No classes scheduled yet.')).not.toBeInTheDocument()
  })

  it('AC-18.3 has no select, input, or button controls on the page apart from the shell navigation', async () => {
    renderPage(teacherUser)
    await screen.findByRole('table')
    expectReadOnly()
    expect(screen.getByRole('table').querySelectorAll('button, select, input')).toHaveLength(0)
  })

  it('AC-18.3 stays read-only in the empty state too', async () => {
    mockApi.get.mockResolvedValue({ kind: 'teacher', periods: PERIODS, entries: [] })
    renderPage(teacherUser)
    await screen.findByText('No classes scheduled yet.')
    expectReadOnly()
  })
})

describe('MyTimetablePage as a student (UC-19, UC-20)', () => {
  beforeEach(() => {
    mockApi.get.mockResolvedValue(STUDENT_RESPONSE)
  })

  it('AC-19.1 shows subject and teacher name in each filled cell', async () => {
    renderPage(studentUser)
    await screen.findByRole('table')

    const monP1 = cellAt('period-1', 'mon')
    expect(within(monP1).getByText('Mathematics')).toBeInTheDocument()
    expect(within(monP1).getByText('Daniel Ortiz')).toBeInTheDocument()

    const friP4 = cellAt('period-4', 'fri')
    expect(within(friP4).getByText('Science')).toBeInTheDocument()
    expect(within(friP4).getByText('Marcus Webb')).toBeInTheDocument()
  })

  it('AC-19.1 leaves cells without an entry empty and does not show the empty-state messages', async () => {
    renderPage(studentUser)
    await screen.findByRole('table')

    expect(cellAt('period-1', 'tue').textContent).toBe('')
    expect(screen.queryByText("Your class's timetable hasn't been set up yet.")).not.toBeInTheDocument()
    expect(
      screen.queryByText("You haven't been assigned to a class section yet. Contact your school admin."),
    ).not.toBeInTheDocument()
  })

  it('AC-19.1 renders from the response kind, not user.role (a teacher-role user receiving a student payload sees teachers)', async () => {
    renderPage(teacherUser)
    await screen.findByRole('table')
    expect(within(cellAt('period-1', 'mon')).getByText('Daniel Ortiz')).toBeInTheDocument()
  })

  it('AC-19.2 has no select, input, or button controls on the page apart from the shell navigation', async () => {
    renderPage(studentUser)
    await screen.findByRole('table')
    expectReadOnly()
    expect(screen.getByRole('table').querySelectorAll('button, select, input')).toHaveLength(0)
  })

  it('AC-19.3 a fresh mount fetches again and shows the latest timetable', async () => {
    mockApi.get.mockResolvedValueOnce(STUDENT_RESPONSE).mockResolvedValueOnce({
      ...STUDENT_RESPONSE,
      entries: [{ id: 'e9', periodId: 'period-1', dayOfWeek: 'mon', subject: ART, teacher: MARCUS }],
    })

    const first = renderPage(studentUser)
    await screen.findByRole('table')
    expect(within(cellAt('period-1', 'mon')).getByText('Mathematics')).toBeInTheDocument()
    first.unmount()

    renderPage(studentUser)
    await waitFor(() => expect(within(cellAt('period-1', 'mon')).getByText('Art')).toBeInTheDocument())
    expect(within(cellAt('period-1', 'mon')).getByText('Marcus Webb')).toBeInTheDocument()
    expect(screen.queryByText('Mathematics')).not.toBeInTheDocument()
    expect(mockApi.get).toHaveBeenCalledTimes(2)
    expect(mockApi.get).toHaveBeenNthCalledWith(2, '/timetable/me')
  })

  it('UC-19-E1 shows "Your class\'s timetable hasn\'t been set up yet." (not an error) when the section has no entries', async () => {
    mockApi.get.mockResolvedValue({ ...STUDENT_RESPONSE, entries: [] })
    renderPage(studentUser)

    expect(await screen.findByText("Your class's timetable hasn't been set up yet.")).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/haven't been assigned/i)).not.toBeInTheDocument()
    expectReadOnly()
  })

  it('AC-20.1 shows the "not assigned" message, and no grid, when the student has no section', async () => {
    mockApi.get.mockResolvedValue({ kind: 'student', section: null, periods: PERIODS, entries: [] })
    renderPage(studentUser)

    expect(
      await screen.findByText("You haven't been assigned to a class section yet. Contact your school admin."),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText("Your class's timetable hasn't been set up yet.")).not.toBeInTheDocument()
    expectReadOnly()
  })

  it('UC-20-E1 after the admin assigns a section, a remount shows the real timetable instead of the message', async () => {
    mockApi.get
      .mockResolvedValueOnce({ kind: 'student', section: null, periods: PERIODS, entries: [] })
      .mockResolvedValueOnce(STUDENT_RESPONSE)

    const first = renderPage(studentUser)
    await screen.findByText("You haven't been assigned to a class section yet. Contact your school admin.")
    first.unmount()

    renderPage(studentUser)
    await screen.findByRole('table')
    expect(within(cellAt('period-1', 'mon')).getByText('Mathematics')).toBeInTheDocument()
    expect(
      screen.queryByText("You haven't been assigned to a class section yet. Contact your school admin."),
    ).not.toBeInTheDocument()
  })
})

describe('MyTimetablePage as a parent (T-031)', () => {
  it('AC-25.3 shows "Not available for your role." with no grid and no alert, and does not fetch', async () => {
    mockApi.get.mockResolvedValue(STUDENT_RESPONSE)
    renderPage(parentUser)

    expect(await screen.findByText('Not available for your role.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    // let any stray effect run, then confirm no request was made
    await new Promise((r) => setTimeout(r, 0))
    expect(mockApi.get).not.toHaveBeenCalled()
  })

  it('AC-25.3 keeps the shell so the parent can go back', async () => {
    const { props } = renderPage(parentUser)
    await screen.findByText('Not available for your role.')
    fireEvent.click(screen.getByText(/back to dashboard/i))
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })
})
