import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { TimetablePage } from './TimetablePage'
import type { AuthUser } from '../lib/auth'
import { api, ApiError } from '../lib/http'

// T-023: TimetablePage is wired to the real APIs (/classes, /classes/:id/sections,
// /classes/:id/subjects, /periods, /sections/:id/timetable). The HTTP layer is mocked; ApiError stays real.
//
// UI CONTRACT the implementation must satisfy (accessible names):
//  - Section picker: one button per section, named "<Class name> - <Section name>" (e.g. "Grade 5 - A").
//    Clicking it (re)fetches that section's timetable and its class's subjects.
//  - Grid: a <table>; row 0 is the header, rows 1..7 follow GET /periods order.
//  - Each period row's text contains the period label then "<start> <end>" formatted with formatTime
//    ("8:00 AM", "8:45 AM", ... "1:00 PM"). The Recess row is a single full-width cell containing
//    "Recess", "10:15 AM" and "10:45 AM" and has no combobox/button.
//  - Each non-break cell has ONE <select> (combobox) with accessible name "<period label> <Day name>"
//    (e.g. "Period 1 Monday"). Its value is the subject id ('' when empty). Its empty option is
//    labelled "Add subject" (value ''). The other options are ONLY the class's subjects (value = subject.id,
//    text = subject name). A class-subject with no teacher is either a disabled option or, when picked,
//    surfaces "Assign a teacher to this subject first." in a role="alert".
//  - A filled cell shows the teacher name as plain text OUTSIDE the <select> (not inside an <option>).
//  - A filled cell has a button named "Clear <period label> <Day name>" (e.g. "Clear Period 2 Tuesday").
//  - Server errors from PUT are shown in a role="alert" element using ApiError.message.
//  - Non-admin users get a read-only grid: no comboboxes, no Clear buttons, no PUT/DELETE.
vi.mock('../lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/http')>()
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  }
})

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const admin: AuthUser = { id: 'admin-1', name: 'Avery Admin', email: 'avery@example.com', role: 'admin' }
const teacher: AuthUser = { id: 'teacher-1', name: 'Tina Teacher', email: 'tina@example.com', role: 'teacher' }

const PERIODS = [
  { id: 'period-1', order: 1, label: 'Period 1', startTime: '08:00', endTime: '08:45', isBreak: false },
  { id: 'period-2', order: 2, label: 'Period 2', startTime: '08:45', endTime: '09:30', isBreak: false },
  { id: 'period-3', order: 3, label: 'Period 3', startTime: '09:30', endTime: '10:15', isBreak: false },
  { id: 'recess', order: 4, label: 'Recess', startTime: '10:15', endTime: '10:45', isBreak: true },
  { id: 'period-4', order: 5, label: 'Period 4', startTime: '10:45', endTime: '11:30', isBreak: false },
  { id: 'period-5', order: 6, label: 'Period 5', startTime: '11:30', endTime: '12:15', isBreak: false },
  { id: 'period-6', order: 7, label: 'Period 6', startTime: '12:15', endTime: '13:00', isBreak: false },
]

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const TEACHING = PERIODS.filter((p) => !p.isBreak)

const MATH = { id: 'sub-math', name: 'Mathematics' }
const SCIENCE = { id: 'sub-sci', name: 'Science' }
const ART = { id: 'sub-art', name: 'Art' }
const CS = { id: 'sub-cs', name: 'Computer Science' }
const DANIEL = { id: 't-daniel', name: 'Daniel Ortiz' }
const MARCUS = { id: 't-marcus', name: 'Marcus Webb' }
const PRIYA = { id: 't-priya', name: 'Priya Nair' }

interface Fixture {
  timetables: Record<string, unknown>
  subjects: Record<string, unknown>
}

function defaultFixture(): Fixture {
  return {
    timetables: {
      s5a: { periods: PERIODS, entries: [] },
      s6a: { periods: PERIODS, entries: [] },
    },
    subjects: {
      c5: [
        { id: 'cs-1', subject: MATH, teacher: DANIEL },
        { id: 'cs-2', subject: SCIENCE, teacher: MARCUS },
      ],
      c6: [{ id: 'cs-3', subject: CS, teacher: PRIYA }],
    },
  }
}

/** Routes api.get by URL. `timetables`/`subjects` values may be a value or a promise. */
function setupGet(fixture: Fixture) {
  mockApi.get.mockImplementation((path: string) => {
    if (path === '/classes') {
      return Promise.resolve([
        { id: 'c5', name: 'Grade 5' },
        { id: 'c6', name: 'Grade 6' },
      ])
    }
    if (path === '/classes/c5/sections') return Promise.resolve([{ id: 's5a', name: 'A', classTeacher: null }])
    if (path === '/classes/c6/sections') return Promise.resolve([{ id: 's6a', name: 'A', classTeacher: null }])
    if (path === '/periods') return Promise.resolve(PERIODS)
    const subjects = /^\/classes\/(\w+)\/subjects$/.exec(path)
    if (subjects) return Promise.resolve(fixture.subjects[subjects[1]])
    const timetable = /^\/sections\/(\w+)\/timetable$/.exec(path)
    if (timetable) return Promise.resolve(fixture.timetables[timetable[1]])
    return Promise.reject(new Error(`unexpected GET ${path}`))
  })
}

function renderPage(user: AuthUser = admin) {
  const props = { user, onBack: vi.fn(), onSignOut: vi.fn() }
  render(<TimetablePage {...props} />)
  return props
}

async function openSection(label: string) {
  fireEvent.click(await screen.findByRole('button', { name: label }))
}

async function openGrade5A() {
  await openSection('Grade 5 - A')
  await screen.findByRole('combobox', { name: 'Period 1 Monday' })
}

function subjectSelect(periodLabel: string, day: string) {
  return screen.getByRole('combobox', { name: `${periodLabel} ${day}` }) as HTMLSelectElement
}

function cellOf(periodLabel: string, day: string) {
  return subjectSelect(periodLabel, day).closest('td') as HTMLElement
}

function teacherTextIn(cell: HTMLElement, name: string) {
  return within(cell).queryByText(name, { ignore: 'option, script, style' })
}

function entry(id: string, periodId: string, dayOfWeek: string, subject: unknown, teacherObj: unknown) {
  return { id, periodId, dayOfWeek, subject, teacher: teacherObj }
}

beforeEach(() => {
  vi.resetAllMocks()
  setupGet(defaultFixture())
})

// ---------------------------------------------------------------------------
// T-004 header/shell regression (kept; now with the API mocked)
// ---------------------------------------------------------------------------
describe('TimetablePage shell', () => {
  it('AC-01.1 header shows the GraduationCap icon and "Brainx School" text', async () => {
    renderPage()
    const header = screen.getByRole('banner')

    expect(within(header).getByText('Brainx School')).toBeInTheDocument()
    expect(document.querySelectorAll('.lucide-graduation-cap').length).toBeGreaterThan(0)
    await screen.findByRole('button', { name: 'Grade 5 - A' })
  })

  it('AC-01.2 header shows only a Sign out button, with no Profile button', async () => {
    const props = renderPage()
    const header = screen.getByRole('banner')

    const signOutButton = within(header).getByRole('button', { name: /sign out/i })
    expect(within(header).queryByRole('button', { name: /^profile$/i })).not.toBeInTheDocument()

    fireEvent.click(signOutButton)
    expect(props.onSignOut).toHaveBeenCalledTimes(1)
    await screen.findByRole('button', { name: 'Grade 5 - A' })
  })

  it('AC-01.5 clicking "Back to dashboard" calls onBack', async () => {
    const props = renderPage()
    fireEvent.click(screen.getByText(/back to dashboard/i))
    expect(props.onBack).toHaveBeenCalledTimes(1)
    await screen.findByRole('button', { name: 'Grade 5 - A' })
  })

  it('own addition: preserves the max-w-6xl content width', async () => {
    renderPage()
    const heading = screen.getByRole('heading', { name: /^timetable$/i })
    expect(heading.closest('.max-w-6xl')).not.toBeNull()
    await screen.findByRole('button', { name: 'Grade 5 - A' })
  })
})

// ---------------------------------------------------------------------------
// UC-16 grid rendering
// ---------------------------------------------------------------------------
describe('TimetablePage grid (UC-16)', () => {
  it('AC-16.3 renders exactly the 7 fixed schedule rows, in order, with labels and time ranges', async () => {
    renderPage()
    await openGrade5A()

    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(8) // header + 7

    const expected = [
      ['Period 1', '8:00 AM', '8:45 AM'],
      ['Period 2', '8:45 AM', '9:30 AM'],
      ['Period 3', '9:30 AM', '10:15 AM'],
      ['Recess', '10:15 AM', '10:45 AM'],
      ['Period 4', '10:45 AM', '11:30 AM'],
      ['Period 5', '11:30 AM', '12:15 PM'],
      ['Period 6', '12:15 PM', '1:00 PM'],
    ]
    expected.forEach(([label, start, end], i) => {
      const text = rows[i + 1].textContent ?? ''
      const labelAt = text.indexOf(label)
      const startAt = text.indexOf(start, labelAt)
      const endAt = text.indexOf(end, startAt + start.length)
      expect(labelAt, `${label} label in row ${i + 1}`).toBeGreaterThanOrEqual(0)
      expect(startAt, `${label} start ${start}`).toBeGreaterThan(labelAt)
      expect(endAt, `${label} end ${end}`).toBeGreaterThan(startAt)
    })

    // no old hardcoded rows
    expect(screen.queryByText(/lunch/i)).not.toBeInTheDocument()
    expect(rows.map((r) => r.textContent).join('|')).not.toMatch(/Period 7/)
  })

  it('AC-16.3 shows Monday to Friday column headers', async () => {
    renderPage()
    await openGrade5A()
    for (const day of DAY_NAMES) {
      expect(screen.getByRole('columnheader', { name: day })).toBeInTheDocument()
    }
  })

  it('AC-16.1 an empty section shows an "Add" affordance in every non-break cell, and no error', async () => {
    renderPage()
    await openGrade5A()

    for (const period of TEACHING) {
      for (const day of DAY_NAMES) {
        const select = subjectSelect(period.label, day)
        expect(select.value).toBe('')
        expect(select.selectedOptions[0]?.textContent).toMatch(/add/i)
      }
    }
    expect(screen.getAllByRole('combobox')).toHaveLength(TEACHING.length * DAY_NAMES.length)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('AC-16.2 existing entries show subject name and teacher name in their cells', async () => {
    const fixture = defaultFixture()
    fixture.timetables.s5a = {
      periods: PERIODS,
      entries: [
        entry('e1', 'period-1', 'mon', MATH, DANIEL),
        entry('e2', 'period-4', 'fri', SCIENCE, MARCUS),
      ],
    }
    setupGet(fixture)
    renderPage()
    await openGrade5A()

    const mon = subjectSelect('Period 1', 'Monday')
    expect(mon.value).toBe(MATH.id)
    expect(mon.selectedOptions[0]?.textContent).toBe('Mathematics')
    expect(teacherTextIn(cellOf('Period 1', 'Monday'), 'Daniel Ortiz')).toBeInTheDocument()

    const fri = subjectSelect('Period 4', 'Friday')
    expect(fri.value).toBe(SCIENCE.id)
    expect(fri.selectedOptions[0]?.textContent).toBe('Science')
    expect(teacherTextIn(cellOf('Period 4', 'Friday'), 'Marcus Webb')).toBeInTheDocument()

    // an untouched cell stays empty
    expect(subjectSelect('Period 1', 'Tuesday').value).toBe('')
    expect(mockApi.get).toHaveBeenCalledWith('/sections/s5a/timetable')
    expect(mockApi.get).toHaveBeenCalledWith('/periods')
  })
})

describe('TimetablePage break row (AC-13.4)', () => {
  it('AC-13.4 the Recess row shows its label and has no selector or button', async () => {
    renderPage()
    await openGrade5A()

    const recessRow = screen.getAllByRole('row')[4]
    expect(recessRow.textContent).toContain('Recess')
    expect(within(recessRow).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(recessRow).queryByRole('button')).not.toBeInTheDocument()
    expect(within(recessRow).getAllByRole('cell')).toHaveLength(1)
    expect(recessRow.querySelector('.lucide-coffee')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// UC-13 assigning
// ---------------------------------------------------------------------------
describe('TimetablePage assign subject (UC-13)', () => {
  it('AC-13.1 picking a subject in an empty cell PUTs it, then the cell shows subject + teacher', async () => {
    mockApi.put.mockResolvedValue(entry('e1', 'period-1', 'mon', MATH, DANIEL))
    renderPage()
    await openGrade5A()

    fireEvent.change(subjectSelect('Period 1', 'Monday'), { target: { value: MATH.id } })

    await waitFor(() =>
      expect(mockApi.put).toHaveBeenCalledWith('/sections/s5a/timetable/period-1/mon', { subjectId: MATH.id }),
    )
    await waitFor(() =>
      expect(teacherTextIn(cellOf('Period 1', 'Monday'), 'Daniel Ortiz')).toBeInTheDocument(),
    )
    expect(subjectSelect('Period 1', 'Monday').selectedOptions[0]?.textContent).toBe('Mathematics')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('AC-13.1 the placed entry persists after a reload (re-render loads it from the API)', async () => {
    const fixture = defaultFixture()
    fixture.timetables.s5a = { periods: PERIODS, entries: [entry('e1', 'period-1', 'mon', MATH, DANIEL)] }
    setupGet(fixture)
    renderPage()
    await openGrade5A()

    expect(subjectSelect('Period 1', 'Monday').value).toBe(MATH.id)
    expect(teacherTextIn(cellOf('Period 1', 'Monday'), 'Daniel Ortiz')).toBeInTheDocument()
  })

  it('AC-13.2 the subject options are only the class\'s assigned subjects (not the catalog)', async () => {
    renderPage()
    await openGrade5A()

    const options = Array.from(subjectSelect('Period 2', 'Wednesday').options).filter((o) => o.value !== '')
    expect(options.map((o) => o.textContent).sort()).toEqual(['Mathematics', 'Science'])
    expect(options.map((o) => o.value).sort()).toEqual([MATH.id, SCIENCE.id].sort())
    expect(mockApi.get).toHaveBeenCalledWith('/classes/c5/subjects')

    // old hardcoded SUBJECTS constants must be gone
    expect(screen.queryByRole('option', { name: 'Physical Education' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Music' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Free period' })).not.toBeInTheDocument()
  })

  it('AC-13.2 another class lists its own subjects', async () => {
    renderPage()
    await openSection('Grade 6 - A')
    await screen.findByRole('combobox', { name: 'Period 1 Monday' })

    const options = Array.from(subjectSelect('Period 1', 'Monday').options).filter((o) => o.value !== '')
    expect(options.map((o) => o.textContent)).toEqual(['Computer Science'])
    expect(mockApi.get).toHaveBeenCalledWith('/classes/c6/subjects')
  })

  it('AC-13.3 a class subject without a teacher cannot be placed (disabled, or shows the server message)', async () => {
    const fixture = defaultFixture()
    fixture.subjects.c5 = [
      { id: 'cs-1', subject: MATH, teacher: DANIEL },
      { id: 'cs-4', subject: ART, teacher: null },
    ]
    setupGet(fixture)
    mockApi.put.mockRejectedValue(new ApiError(400, { message: 'Assign a teacher to this subject first.' }))
    renderPage()
    await openGrade5A()

    const select = subjectSelect('Period 1', 'Monday')
    const artOption = Array.from(select.options).find((o) => (o.textContent ?? '').startsWith('Art'))
    expect(artOption).toBeDefined()

    if (artOption!.disabled) {
      expect(mockApi.put).not.toHaveBeenCalled()
    } else {
      fireEvent.change(select, { target: { value: ART.id } })
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Assign a teacher to this subject first.')
      await waitFor(() => expect(subjectSelect('Period 1', 'Monday').value).toBe(''))
    }
    expect(teacherTextIn(cellOf('Period 1', 'Monday'), 'Daniel Ortiz')).not.toBeInTheDocument()
  })
})

describe('TimetablePage conflicts (UC-14)', () => {
  it('AC-14.1 a rejected PUT shows the server message and leaves the cell unchanged', async () => {
    const message = 'Teacher is already scheduled for Grade 6-A at this time.'
    mockApi.put.mockRejectedValue(
      new ApiError(400, { message, conflict: { sectionId: 's6a', periodId: 'period-1', dayOfWeek: 'mon' } }),
    )
    renderPage()
    await openGrade5A()

    fireEvent.change(subjectSelect('Period 1', 'Monday'), { target: { value: MATH.id } })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    expect(subjectSelect('Period 1', 'Monday').value).toBe('')
    expect(teacherTextIn(cellOf('Period 1', 'Monday'), 'Daniel Ortiz')).not.toBeInTheDocument()
    expect(within(cellOf('Period 1', 'Monday')).queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
  })

  it('AC-14.1 a rejected replacement keeps the previous entry in the cell', async () => {
    const fixture = defaultFixture()
    fixture.timetables.s5a = { periods: PERIODS, entries: [entry('e1', 'period-1', 'mon', MATH, DANIEL)] }
    setupGet(fixture)
    mockApi.put.mockRejectedValue(
      new ApiError(400, { message: 'Teacher is already scheduled for Grade 6-A at this time.' }),
    )
    renderPage()
    await openGrade5A()

    fireEvent.change(subjectSelect('Period 1', 'Monday'), { target: { value: SCIENCE.id } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Teacher is already scheduled for Grade 6-A at this time.',
    )
    await waitFor(() => expect(subjectSelect('Period 1', 'Monday').value).toBe(MATH.id))
    expect(teacherTextIn(cellOf('Period 1', 'Monday'), 'Daniel Ortiz')).toBeInTheDocument()
    expect(teacherTextIn(cellOf('Period 1', 'Monday'), 'Marcus Webb')).not.toBeInTheDocument()
  })
})

describe('TimetablePage clear (UC-15)', () => {
  it('AC-15.1 clearing a filled cell DELETEs it and the cell shows as empty', async () => {
    const fixture = defaultFixture()
    fixture.timetables.s5a = { periods: PERIODS, entries: [entry('e2', 'period-2', 'tue', SCIENCE, MARCUS)] }
    setupGet(fixture)
    mockApi.delete.mockResolvedValue(undefined)
    renderPage()
    await openGrade5A()

    expect(subjectSelect('Period 2', 'Tuesday').value).toBe(SCIENCE.id)
    fireEvent.click(screen.getByRole('button', { name: 'Clear Period 2 Tuesday' }))

    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledWith('/sections/s5a/timetable/period-2/tue'))
    await waitFor(() => expect(subjectSelect('Period 2', 'Tuesday').value).toBe(''))
    expect(teacherTextIn(cellOf('Period 2', 'Tuesday'), 'Marcus Webb')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear Period 2 Tuesday' })).not.toBeInTheDocument()
  })

  it('AC-15.1 empty cells have no Clear button', async () => {
    renderPage()
    await openGrade5A()
    expect(screen.queryByRole('button', { name: /^clear /i })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// AC-22.1 (timetable part) and UC-16-E1
// ---------------------------------------------------------------------------
describe('TimetablePage data freshness', () => {
  it('AC-22.1 after a subject is renamed, reselecting the section shows the server\'s new name', async () => {
    const fixture = defaultFixture()
    fixture.timetables.s5a = { periods: PERIODS, entries: [entry('e1', 'period-1', 'mon', MATH, DANIEL)] }
    setupGet(fixture)
    renderPage()
    await openGrade5A()
    expect(subjectSelect('Period 1', 'Monday').selectedOptions[0]?.textContent).toBe('Mathematics')

    // Admin renames the subject elsewhere (catalog); server now returns the new name.
    const renamed = { id: MATH.id, name: 'Advanced Mathematics' }
    fixture.timetables.s5a = { periods: PERIODS, entries: [entry('e1', 'period-1', 'mon', renamed, DANIEL)] }
    fixture.subjects.c5 = [
      { id: 'cs-1', subject: renamed, teacher: DANIEL },
      { id: 'cs-2', subject: SCIENCE, teacher: MARCUS },
    ]

    await openSection('Grade 6 - A')
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/sections/s6a/timetable'))
    await openSection('Grade 5 - A')

    await waitFor(() =>
      expect(subjectSelect('Period 1', 'Monday').selectedOptions[0]?.textContent).toBe('Advanced Mathematics'),
    )
    expect(screen.queryByRole('option', { name: 'Mathematics' })).not.toBeInTheDocument()
  })

  it('UC-16-E1 switching sections loads the new section\'s grid', async () => {
    const fixture = defaultFixture()
    fixture.timetables.s5a = { periods: PERIODS, entries: [entry('e1', 'period-1', 'mon', MATH, DANIEL)] }
    fixture.timetables.s6a = { periods: PERIODS, entries: [entry('e9', 'period-2', 'thu', CS, PRIYA)] }
    setupGet(fixture)
    renderPage()
    await openGrade5A()
    expect(subjectSelect('Period 1', 'Monday').value).toBe(MATH.id)

    await openSection('Grade 6 - A')

    await waitFor(() => expect(subjectSelect('Period 2', 'Thursday').value).toBe(CS.id))
    expect(subjectSelect('Period 1', 'Monday').value).toBe('')
    expect(teacherTextIn(cellOf('Period 2', 'Thursday'), 'Priya Nair')).toBeInTheDocument()
    expect(screen.queryByText('Daniel Ortiz', { ignore: 'option' })).not.toBeInTheDocument()
  })

  it('UC-16-E1 a slow response for the old section must not overwrite the newly selected section', async () => {
    const fixture = defaultFixture()
    fixture.timetables.s6a = { periods: PERIODS, entries: [entry('e9', 'period-2', 'thu', CS, PRIYA)] }
    let resolveOld!: (value: unknown) => void
    fixture.timetables.s5a = new Promise((resolve) => {
      resolveOld = resolve
    })
    setupGet(fixture)
    renderPage()

    await openSection('Grade 5 - A') // old section: response stays pending
    await openSection('Grade 6 - A') // new section: responds immediately
    await waitFor(() => expect(subjectSelect('Period 2', 'Thursday').value).toBe(CS.id))

    await act(async () => {
      resolveOld({ periods: PERIODS, entries: [entry('e1', 'period-1', 'mon', MATH, DANIEL)] })
    })

    expect(subjectSelect('Period 2', 'Thursday').value).toBe(CS.id)
    expect(subjectSelect('Period 1', 'Monday').value).toBe('')
    expect(screen.queryByText('Daniel Ortiz', { ignore: 'option' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Grade 6 - A/ })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Review follow-ups: empty-option on filled cell, section switch during a save,
// concurrent mutations with a 404 refresh, accessibility
// ---------------------------------------------------------------------------
describe('TimetablePage review follow-ups', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  it('AC-15.1 selecting the empty "Add subject" option on a filled cell sends no write and keeps the subject', async () => {
    const fixture = defaultFixture()
    fixture.timetables.s5a = { periods: PERIODS, entries: [entry('e1', 'period-1', 'mon', MATH, DANIEL)] }
    setupGet(fixture)
    renderPage()
    await openGrade5A()

    fireEvent.change(subjectSelect('Period 1', 'Monday'), { target: { value: '' } })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockApi.put).not.toHaveBeenCalled()
    expect(mockApi.delete).not.toHaveBeenCalled()
    expect(subjectSelect('Period 1', 'Monday').value).toBe(MATH.id)
    expect(subjectSelect('Period 1', 'Monday').selectedOptions[0]?.textContent).toBe('Mathematics')
    expect(teacherTextIn(cellOf('Period 1', 'Monday'), 'Daniel Ortiz')).toBeInTheDocument()
  })

  it('UC-16-E1 a pending save in section A does not block section B, and A\'s result does not overwrite B', async () => {
    const pendingA = deferred<unknown>()
    mockApi.put.mockImplementation((path: string) => {
      if (path === '/sections/s5a/timetable/period-1/mon') return pendingA.promise
      if (path === '/sections/s6a/timetable/period-1/mon') {
        return Promise.resolve(entry('e-b', 'period-1', 'mon', CS, PRIYA))
      }
      return Promise.reject(new Error(`unexpected PUT ${path}`))
    })
    renderPage()
    await openGrade5A()

    fireEvent.change(subjectSelect('Period 1', 'Monday'), { target: { value: MATH.id } })
    await waitFor(() =>
      expect(mockApi.put).toHaveBeenCalledWith('/sections/s5a/timetable/period-1/mon', { subjectId: MATH.id }),
    )

    await openSection('Grade 6 - A')
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/sections/s6a/timetable'))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Grade 6 - A/ })).toBeInTheDocument()
      expect(subjectSelect('Period 1', 'Monday')).toBeEnabled()
    })

    fireEvent.change(subjectSelect('Period 1', 'Monday'), { target: { value: CS.id } })
    await waitFor(() =>
      expect(mockApi.put).toHaveBeenCalledWith('/sections/s6a/timetable/period-1/mon', { subjectId: CS.id }),
    )
    await waitFor(() => expect(subjectSelect('Period 1', 'Monday').value).toBe(CS.id))

    await act(async () => {
      pendingA.resolve(entry('e-a', 'period-1', 'mon', MATH, DANIEL))
    })

    expect(subjectSelect('Period 1', 'Monday').value).toBe(CS.id)
    expect(teacherTextIn(cellOf('Period 1', 'Monday'), 'Priya Nair')).toBeInTheDocument()
    expect(screen.queryByText('Daniel Ortiz', { ignore: 'option' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Mathematics' })).not.toBeInTheDocument()
  })

  it('AC-13.1 a pending save is kept when another cell fails with 404 and the grid refreshes', async () => {
    const pendingX = deferred<unknown>()
    const xEntry = entry('e-x', 'period-1', 'mon', MATH, DANIEL)
    mockApi.put.mockImplementation((path: string) => {
      if (path === '/sections/s5a/timetable/period-1/mon') return pendingX.promise
      if (path === '/sections/s5a/timetable/period-2/tue') {
        return Promise.reject(new ApiError(404, { message: 'Timetable entry not found.' }))
      }
      return Promise.reject(new Error(`unexpected PUT ${path}`))
    })
    renderPage()
    await openGrade5A()

    // The refresh (triggered by Y's 404) returns the grid WITHOUT X, whose save is still pending.
    const fixture = defaultFixture()
    fixture.timetables.s5a = { periods: PERIODS, entries: [] }
    setupGet(fixture)
    const getCallsBefore = mockApi.get.mock.calls.length

    fireEvent.change(subjectSelect('Period 1', 'Monday'), { target: { value: MATH.id } }) // X
    fireEvent.change(subjectSelect('Period 2', 'Tuesday'), { target: { value: SCIENCE.id } }) // Y

    await waitFor(() => expect(mockApi.put).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mockApi.get.mock.calls.length).toBeGreaterThan(getCallsBefore))

    await act(async () => {
      pendingX.resolve(xEntry)
    })

    await waitFor(() => expect(subjectSelect('Period 1', 'Monday').value).toBe(MATH.id))
    expect(teacherTextIn(cellOf('Period 1', 'Monday'), 'Daniel Ortiz')).toBeInTheDocument()
    expect(subjectSelect('Period 1', 'Monday')).toBeEnabled()
    expect(subjectSelect('Period 2', 'Tuesday').value).toBe('')
  })

  it('AC-16.3 day headers are columnheaders and each period label is a rowheader', async () => {
    renderPage()
    await openGrade5A()

    const columnHeaders = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())
    for (const day of DAY_NAMES) expect(columnHeaders).toContain(day)

    const rowHeaders = screen.getAllByRole('rowheader').map((h) => h.textContent ?? '')
    for (const period of TEACHING) {
      expect(rowHeaders.some((text) => text.includes(period.label)), `rowheader for ${period.label}`).toBe(true)
    }
    expect(rowHeaders).toHaveLength(TEACHING.length) // Recess stays a single full-width cell
  })

  it('AC-14.1 a cell error is exposed as the accessible description of its select', async () => {
    const message = 'Teacher is already scheduled for Grade 6-A at this time.'
    mockApi.put.mockRejectedValue(new ApiError(400, { message }))
    renderPage()
    await openGrade5A()

    fireEvent.change(subjectSelect('Period 1', 'Monday'), { target: { value: MATH.id } })

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(subjectSelect('Period 1', 'Monday')).toHaveAccessibleDescription(message)
    expect(subjectSelect('Period 1', 'Tuesday')).not.toHaveAccessibleDescription(message)
  })
})

// ---------------------------------------------------------------------------
// AC-17.2 page-level: a non-admin is never given write controls
// ---------------------------------------------------------------------------
describe('TimetablePage as a non-admin (AC-17.2)', () => {
  it('AC-17.2 a teacher gets no subject selectors, no Clear buttons and no writes', async () => {
    const fixture = defaultFixture()
    fixture.timetables.s5a = { periods: PERIODS, entries: [entry('e1', 'period-1', 'mon', MATH, DANIEL)] }
    setupGet(fixture)
    renderPage(teacher)

    // give the page time to load whatever it loads
    await act(async () => {
      await Promise.resolve()
    })
    const sectionButton = screen.queryByRole('button', { name: 'Grade 5 - A' })
    if (sectionButton) fireEvent.click(sectionButton)
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /^clear /i })).not.toBeInTheDocument()
    expect(mockApi.put).not.toHaveBeenCalled()
    expect(mockApi.delete).not.toHaveBeenCalled()
  })
})
