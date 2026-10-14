import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { MarkAttendancePage } from './MarkAttendancePage'
import type { AuthUser } from '../lib/auth'
import { api } from '../lib/http'

// T-033: MarkAttendancePage is wired to the real attendance API from T-032
// (`PUT`/`GET /attendance/sections/:sectionId/days/:date`) plus `GET /classes` and
// `GET /classes/:classId/sections` for the teacher's own-section picker. The HTTP layer is
// mocked; ApiError stays real. The real wiring does not exist yet — these tests are expected
// to fail against the current (mock-data) component.
//
// UI CONTRACT this test suite assumes (the component doesn't implement it yet):
//  - Section picker: a <select> labelled "Class section" whose options are ONLY the sections
//    where `classTeacher.id === user.id`, built from `GET /classes` + `GET /classes/:classId/sections`
//    (same two-step fetch TimetablePage already does), labelled "<Class name> - <Section name>".
//    If the teacher owns no section at all, no picker is shown — instead the exact text
//    "You are not the class teacher for any section." is shown.
//  - Date picker: an <input type="date"> labelled "Date", defaulting to today.
//  - On mount, and whenever the selected section or date changes, the page loads that day's
//    roster + attendance via `GET /attendance/sections/:sectionId/days/:date`.
//  - RESOLVED (was flagged as an assumption, now the shipped contract): T-032's GET response had
//    no student names and 404'd with an empty body when nothing had been submitted yet — so there
//    was no way for a teacher to enumerate "every enrolled student" before a first submission
//    exists. This is now fixed by extending the GET response itself (no separate roster endpoint):
//    it always returns 200 with `entries: [{ student: { id, name }, status }]` — `status: null`
//    per roster student when nothing has been submitted yet (`submitted: false, locked: false`),
//    or the stored statuses once something has (`submitted: true, locked, submittedBy,
//    submittedAt, entries, edits: []`). The component sources names straight from this response's
//    `entries` (defaulting to "present" for any `status: null` entry) — no separate roster fetch.
//  - Not-yet-submitted (`submitted: false`) + non-empty roster: shows one <li> per enrolled student (found
//    via its name), each defaulted to "Present", with "Present"/"Absent"/"Leave" buttons scoped
//    to that row (`within(row).getByRole('button', { name: ... })`), and a "Submit attendance"
//    button that PUTs `{ entries: [{ studentId, status }, ...] }` (one per roster student).
//  - Zero enrolled students: the exact text "No students enrolled." is shown, nothing to submit.
//  - After a successful submit (or when GET already finds a session for today, i.e. `locked:
//    false`), the page shows a per-status count summary as "<Label> · <count>" (e.g. "Present · 2"),
//    plus an "Edit" button. Clicking "Edit" re-reveals the same per-student toggle buttons
//    (preloaded with the current statuses) and a "Save changes" button, which PUTs again.
//  - When the loaded record's `locked` is true (selected date isn't today), no "Edit" control is
//    shown — instead text matching /locked/i and /contact an admin/i is shown.
//  - A submit/save failure shows a role="alert" with the error message (ApiError.message for 4xx,
//    the generic "Something went wrong..." message otherwise), keeps the teacher's in-progress
//    draft untouched, and leaves the submit/save control in place so they can retry.
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
}

const teacher: AuthUser = { id: 'teacher-1', name: 'Tina Teacher', email: 'tina@example.com', role: 'teacher' }
const otherTeacher: AuthUser = { id: 'teacher-2', name: 'Owen Other', email: 'owen@example.com', role: 'teacher' }

const TODAY = '2026-03-10'
const YESTERDAY = '2026-03-09'

const CLASSES = [
  { id: 'c5', name: 'Grade 5' },
  { id: 'c6', name: 'Grade 6' },
]

const ROSTER_3 = [
  { id: 'st-1', name: 'Ava Thompson' },
  { id: 'st-2', name: 'Liam Chen' },
  { id: 'st-3', name: 'Noah Patel' },
]

interface Fixture {
  sectionsByClass: Record<string, unknown[]>
  rosterBySection: Record<string, { id: string; name: string }[]>
  // keyed by `${sectionId}__${date}` — the exact GET /attendance/sections/:id/days/:date response
  // body. If a key has no explicit entry, `setupGet` falls back to a not-yet-submitted response
  // built from `rosterBySection`, mirroring the real backend (always 200, never 404).
  attendance: Record<string, Record<string, unknown>>
}

/** Not-yet-submitted shape: every roster student present with `status: null`. */
function notSubmitted(roster: { id: string; name: string }[]) {
  return { submitted: false, locked: false, entries: roster.map((student) => ({ student, status: null })) }
}

/** Already-submitted shape: one entry per roster student, with its stored status. */
function submittedDay(
  roster: { id: string; name: string }[],
  statuses: Record<string, 'present' | 'absent' | 'leave'>,
  meta: { submittedBy: { id: string; name: string }; submittedAt: string; locked: boolean },
) {
  return {
    submitted: true,
    locked: meta.locked,
    submittedBy: meta.submittedBy,
    submittedAt: meta.submittedAt,
    entries: roster.map((student) => ({ student, status: statuses[student.id] })),
    edits: [],
  }
}

function defaultFixture(): Fixture {
  return {
    sectionsByClass: {
      c5: [
        { id: 's5a', name: 'A', classTeacher: { id: teacher.id, name: teacher.name } },
        { id: 's5b', name: 'B', classTeacher: { id: otherTeacher.id, name: otherTeacher.name } },
      ],
      c6: [{ id: 's6a', name: 'A', classTeacher: null }],
    },
    rosterBySection: { s5a: ROSTER_3 },
    attendance: {
      [`s5a__${TODAY}`]: notSubmitted(ROSTER_3),
    },
  }
}

function setupGet(fixture: Fixture) {
  mockApi.get.mockImplementation((path: string) => {
    if (path === '/classes') return Promise.resolve(CLASSES)

    const sections = /^\/classes\/([^/]+)\/sections$/.exec(path)
    if (sections) return Promise.resolve(fixture.sectionsByClass[sections[1]] ?? [])

    const day = /^\/attendance\/sections\/([^/]+)\/days\/([^/]+)$/.exec(path)
    if (day) {
      const record = fixture.attendance[`${day[1]}__${day[2]}`]
      if (record) return Promise.resolve(record)
      return Promise.resolve(notSubmitted(fixture.rosterBySection[day[1]] ?? []))
    }

    return Promise.reject(new Error(`unexpected GET ${path}`))
  })
}

function renderPage(user: AuthUser = teacher) {
  const props = { user, onBack: vi.fn(), onSignOut: vi.fn() }
  const view = render(<MarkAttendancePage {...props} />)
  return { props, ...view }
}

async function waitForSectionLoaded() {
  await screen.findByLabelText('Class section')
}

function studentRow(name: string): HTMLElement {
  return screen.getByText(name).closest('li') as HTMLElement
}

function statusButton(row: HTMLElement, label: 'Present' | 'Absent' | 'Leave') {
  return within(row).getByRole('button', { name: label })
}

function putCalls() {
  return mockApi.put.mock.calls
}

function lastPutEntries(): Record<string, string> {
  const call = putCalls().at(-1)
  const entries = (call?.[1] as { entries?: { studentId: string; status: string }[] } | undefined)?.entries ?? []
  return Object.fromEntries(entries.map((e) => [e.studentId, e.status]))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`))
  setupGet(defaultFixture())
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// T-004 shell regression (kept; now with the real API mocked)
// ---------------------------------------------------------------------------
describe('MarkAttendancePage shell', () => {
  it('AC-01.1 header shows the GraduationCap icon and "Brainx School" text', async () => {
    renderPage()
    await waitForSectionLoaded()
    const header = screen.getByRole('banner')

    expect(within(header).getByText('Brainx School')).toBeInTheDocument()
    expect(document.querySelectorAll('.lucide-graduation-cap').length).toBeGreaterThan(0)
  })

  it('AC-01.2 header shows only a Sign out button, with no Profile button', async () => {
    const { props } = renderPage()
    await waitForSectionLoaded()
    const header = screen.getByRole('banner')

    const signOutButton = within(header).getByRole('button', { name: /sign out/i })
    expect(within(header).queryByRole('button', { name: /^profile$/i })).not.toBeInTheDocument()

    fireEvent.click(signOutButton)
    expect(props.onSignOut).toHaveBeenCalledTimes(1)
  })

  it('AC-01.5 clicking "Back to dashboard" calls onBack', async () => {
    const { props } = renderPage()
    await waitForSectionLoaded()
    fireEvent.click(screen.getByText(/back to dashboard/i))
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Section picker: the teacher's own section(s) only
// ---------------------------------------------------------------------------
describe('MarkAttendancePage section picker (T-033 technical notes)', () => {
  it('own addition: lists only sections where classTeacher.id matches the logged-in teacher', async () => {
    renderPage()
    await waitForSectionLoaded()

    const picker = screen.getByLabelText('Class section') as HTMLSelectElement
    const optionLabels = Array.from(picker.options).map((o) => o.textContent)
    expect(optionLabels).toEqual(['Grade 5 - A'])
    expect(optionLabels).not.toContain('Grade 5 - B')
    expect(optionLabels).not.toContain('Grade 6 - A')

    expect(mockApi.get).toHaveBeenCalledWith('/classes')
    expect(mockApi.get).toHaveBeenCalledWith('/classes/c5/sections')
    expect(mockApi.get).toHaveBeenCalledWith('/classes/c6/sections')
  })

  it('own addition: a teacher who owns no section sees a message instead of a picker', async () => {
    const lonelyTeacher: AuthUser = { id: 'teacher-3', name: 'Nora Nobody', email: 'nora@example.com', role: 'teacher' }
    renderPage(lonelyTeacher)

    expect(
      await screen.findByText('You are not the class teacher for any section.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Class section')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument()
  })

  it('own addition: a teacher who owns multiple sections can switch between them', async () => {
    const fixture = defaultFixture()
    fixture.sectionsByClass.c6 = [{ id: 's6a', name: 'A', classTeacher: { id: teacher.id, name: teacher.name } }]
    fixture.rosterBySection.s6a = [{ id: 'st-9', name: 'Priya Rao' }]
    fixture.attendance[`s6a__${TODAY}`] = notSubmitted(fixture.rosterBySection.s6a)
    setupGet(fixture)

    renderPage()
    const picker = await screen.findByLabelText('Class section')
    await screen.findByText('Ava Thompson')

    fireEvent.change(picker, { target: { value: 's6a' } })

    await screen.findByText('Priya Rao')
    expect(screen.queryByText('Ava Thompson')).not.toBeInTheDocument()
    expect(mockApi.get).toHaveBeenCalledWith(`/attendance/sections/s6a/days/${TODAY}`)
  })
})

describe('MarkAttendancePage date input (T-033 technical notes)', () => {
  it('own addition: clearing the date input does not fire a request for the malformed empty date', async () => {
    renderPage()
    const dateInput = await screen.findByLabelText('Date')
    await screen.findByText('Ava Thompson')
    mockApi.get.mockClear()

    fireEvent.change(dateInput, { target: { value: '' } })

    // Give any (incorrectly) fired request a tick to resolve/reject before asserting it never happened.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockApi.get).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // The previously loaded day's data stays on screen rather than being cleared out.
    expect(screen.getByText('Ava Thompson')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// AC-01.1 / UC-01-E1: first submission
// ---------------------------------------------------------------------------
describe('MarkAttendancePage first submission (UC-01)', () => {
  it('AC-01.1 submitting a status for every enrolled student saves it and shows the submitted summary', async () => {
    const fixture = defaultFixture()
    setupGet(fixture)
    mockApi.put.mockResolvedValue({
      entries: [
        { studentId: 'st-1', status: 'present' },
        { studentId: 'st-2', status: 'absent' },
        { studentId: 'st-3', status: 'leave' },
      ],
      submittedBy: { id: teacher.id, name: teacher.name },
      submittedAt: `${TODAY}T10:05:00.000Z`,
      locked: false,
    })

    renderPage()
    await screen.findByText('Ava Thompson')
    await screen.findByText('Liam Chen')
    await screen.findByText('Noah Patel')

    // Every student defaults to Present.
    for (const name of ['Ava Thompson', 'Liam Chen', 'Noah Patel']) {
      expect(statusButton(studentRow(name), 'Present')).toHaveAttribute('aria-pressed', 'true')
    }

    fireEvent.click(statusButton(studentRow('Liam Chen'), 'Absent'))
    fireEvent.click(statusButton(studentRow('Noah Patel'), 'Leave'))
    fireEvent.click(screen.getByRole('button', { name: /submit attendance/i }))

    await waitFor(() =>
      expect(mockApi.put).toHaveBeenCalledWith('/attendance/sections/s5a/days/2026-03-10', {
        entries: expect.any(Array),
      }),
    )
    expect(lastPutEntries()).toEqual({ 'st-1': 'present', 'st-2': 'absent', 'st-3': 'leave' })

    expect(await screen.findByText('Present · 1')).toBeInTheDocument()
    expect(screen.getByText('Absent · 1')).toBeInTheDocument()
    expect(screen.getByText('Leave · 1')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('UC-01-E1 a section with zero enrolled students shows "No students enrolled." and has nothing to submit', async () => {
    const fixture = defaultFixture()
    fixture.rosterBySection.s5a = []
    fixture.attendance[`s5a__${TODAY}`] = notSubmitted([])
    setupGet(fixture)

    renderPage()

    expect(await screen.findByText('No students enrolled.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit attendance/i })).not.toBeInTheDocument()
    expect(mockApi.put).not.toHaveBeenCalled()
  })

  it('UC-01-E3 a network failure mid-submit shows an error, saves nothing, and keeps the draft so the teacher can retry', async () => {
    const fixture = defaultFixture()
    setupGet(fixture)
    mockApi.put.mockRejectedValueOnce(new Error('network down'))

    renderPage()
    await screen.findByText('Ava Thompson')

    fireEvent.click(statusButton(studentRow('Liam Chen'), 'Absent'))
    fireEvent.click(screen.getByRole('button', { name: /submit attendance/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/something went wrong/i)
    // Nothing was "saved" — no submitted summary appears.
    expect(screen.queryByText(/present · /i)).not.toBeInTheDocument()
    // The teacher's in-progress choice survives the failed attempt.
    expect(statusButton(studentRow('Liam Chen'), 'Absent')).toHaveAttribute('aria-pressed', 'true')

    // Retry succeeds.
    mockApi.put.mockResolvedValueOnce({
      entries: [
        { studentId: 'st-1', status: 'present' },
        { studentId: 'st-2', status: 'absent' },
        { studentId: 'st-3', status: 'present' },
      ],
      submittedBy: { id: teacher.id, name: teacher.name },
      submittedAt: `${TODAY}T10:06:00.000Z`,
      locked: false,
    })
    fireEvent.click(screen.getByRole('button', { name: /submit attendance/i }))

    expect(await screen.findByText('Present · 2')).toBeInTheDocument()
    expect(screen.getByText('Absent · 1')).toBeInTheDocument()
    expect(mockApi.put).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// AC-02.1: same-day re-edit
// ---------------------------------------------------------------------------
describe('MarkAttendancePage same-day re-edit (UC-02)', () => {
  function alreadySubmittedToday() {
    const fixture = defaultFixture()
    fixture.attendance[`s5a__${TODAY}`] = submittedDay(
      ROSTER_3,
      { 'st-1': 'present', 'st-2': 'present', 'st-3': 'absent' },
      { submittedBy: { id: teacher.id, name: teacher.name }, submittedAt: `${TODAY}T08:15:00.000Z`, locked: false },
    )
    return fixture
  }

  it('AC-02.1 changing a student\'s status and saving persists it and shows it immediately', async () => {
    setupGet(alreadySubmittedToday())
    mockApi.put.mockResolvedValue({
      entries: [
        { studentId: 'st-1', status: 'present' },
        { studentId: 'st-2', status: 'absent' },
        { studentId: 'st-3', status: 'absent' },
      ],
      submittedBy: { id: teacher.id, name: teacher.name },
      submittedAt: `${TODAY}T10:10:00.000Z`,
      locked: false,
    })

    renderPage()
    expect(await screen.findByText('Present · 2')).toBeInTheDocument()
    expect(screen.getByText('Absent · 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    fireEvent.click(statusButton(studentRow('Liam Chen'), 'Absent'))
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(mockApi.put).toHaveBeenCalledWith('/attendance/sections/s5a/days/2026-03-10', {
        entries: expect.any(Array),
      }),
    )
    expect(lastPutEntries()).toEqual({ 'st-1': 'present', 'st-2': 'absent', 'st-3': 'absent' })

    expect(await screen.findByText('Present · 1')).toBeInTheDocument()
    expect(screen.getByText('Absent · 2')).toBeInTheDocument()
    // Back to the read view — not still showing the editable toggles.
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
  })

  it('own addition: a locked (non-today) day shows no Edit control, only the locked message', async () => {
    const fixture = defaultFixture()
    fixture.attendance[`s5a__${YESTERDAY}`] = submittedDay(
      ROSTER_3,
      { 'st-1': 'present', 'st-2': 'present', 'st-3': 'present' },
      { submittedBy: { id: teacher.id, name: teacher.name }, submittedAt: `${YESTERDAY}T08:15:00.000Z`, locked: true },
    )
    setupGet(fixture)

    renderPage()
    await waitForSectionLoaded()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: YESTERDAY } })

    expect(await screen.findByText(/locked/i)).toBeInTheDocument()
    expect(screen.getByText(/contact an admin/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit attendance/i })).not.toBeInTheDocument()
  })

  it('own addition: a locked (non-today) day with nothing ever submitted shows a no-data message, not a submittable form', async () => {
    const fixture = defaultFixture()
    fixture.attendance[`s5a__${YESTERDAY}`] = {
      submitted: false,
      locked: true,
      entries: ROSTER_3.map((student) => ({ student, status: null })),
    }
    setupGet(fixture)

    renderPage()
    await waitForSectionLoaded()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: YESTERDAY } })

    expect(await screen.findByText(/no attendance was recorded for this day/i)).toBeInTheDocument()
    expect(screen.getByText(/locked/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit attendance/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Present' })).not.toBeInTheDocument()
  })

  it('own addition: switching the date back to today (still unlocked) restores the Edit control', async () => {
    const fixture = alreadySubmittedToday()
    fixture.attendance[`s5a__${YESTERDAY}`] = submittedDay(
      ROSTER_3,
      { 'st-1': 'present', 'st-2': 'present', 'st-3': 'present' },
      { submittedBy: { id: teacher.id, name: teacher.name }, submittedAt: `${YESTERDAY}T08:15:00.000Z`, locked: true },
    )
    setupGet(fixture)

    renderPage()
    await screen.findByText('Present · 2')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: YESTERDAY } })
    await screen.findByText(/locked/i)

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: TODAY } })

    expect(await screen.findByRole('button', { name: /^edit$/i })).toBeInTheDocument()
    expect(screen.queryByText(/locked/i)).not.toBeInTheDocument()
  })
})
