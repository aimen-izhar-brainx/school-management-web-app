import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { AttendancePage } from './AttendancePage'
import type { AuthUser } from '../lib/auth'
import { api } from '../lib/http'
import { formatDateTimeLabel, rosterFor } from '../data/attendance'
import { SECTION_OPTIONS } from '../data/timetable'

// T-035: AttendancePage's "Browse & edit" section is wired to the real admin attendance API from
// T-034 (`GET`/`PATCH /attendance/admin/sections/:sectionId/days/:date`) plus `GET /classes` and
// `GET /classes/:classId/sections` for the admin's flat section picker — admin sees every section,
// unlike T-033's teacher-scoped picker on MarkAttendancePage. The HTTP layer is mocked; ApiError
// stays real. The real wiring does not exist yet — these tests are expected to fail against the
// current (mock-data) component.
//
// UI CONTRACT this test suite assumes (the component doesn't implement it yet):
//  - Section picker: a <select id="browse-section"> whose options are EVERY section across EVERY
//    class (no ownership filter), built from `GET /classes` + `GET /classes/:classId/sections`
//    (same two-step fetch TimetablePage/MarkAttendancePage already do), labelled
//    "<Class name> - <Section name>".
//  - Date picker: an <input id="browse-date" type="date">.
//  - On mount, and whenever the selected section or date changes, the page loads that day's data
//    via `GET /attendance/admin/sections/:sectionId/days/:date`, whose response shape is
//    `{ submitted, locked, entries: [{ student: { id, name }, status }], submittedBy?, submittedAt?,
//    edits?: [{ studentId, fromStatus, toStatus, editedById, editedAt }] }`.
//  - `submitted: false` renders the existing dashed "Not marked yet..." empty-state box (AC-06.2 /
//    UC-06-E1), never an error — regardless of whether the date is in the past or future.
//  - `entries.length === 0` (zero enrolled students) renders "No students enrolled." (same
//    empty-roster handling pattern as MarkAttendancePage), without crashing (UC-06-E2).
//  - A recorded session shows every student's name + current status, "Marked by {submittedBy.name}
//    · {submittedAt}", and — when `edits` is non-empty — an "Edit log" list (AC-06.1).
//  - No "Roll no." column (no roll-number field in real data, per T-033's note reused here).
//  - "Edit this day" reveals per-student Present/Absent/Leave toggle buttons + "Save changes",
//    which PATCHes `/attendance/admin/sections/:sectionId/days/:date` with `{ entries: [...] }`
//    (changed entries at minimum); on success the page re-renders from the response, including its
//    `edits` array in the Edit log (AC-05.3). Changing section/date mid-edit exits edit mode.
vi.mock('../lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/http')>()
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  }
})

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
}

const admin: AuthUser = { id: 'admin-1', name: 'Avery Admin', email: 'avery@example.com', role: 'admin' }
const otherAdmin = { id: 'admin-2', name: 'Priya Principal' }

type Student = { id: string; name: string }
type EntryStatus = 'present' | 'absent' | 'leave'
type AuditRow = {
  studentId: string
  fromStatus: EntryStatus
  toStatus: EntryStatus
  editedById: string
  editedBy?: { id: string; name: string }
  editedAt: string
}

const CLASSES = [
  { id: 'c5', name: 'Grade 5' },
  { id: 'c6', name: 'Grade 6' },
]

const SECTIONS_BY_CLASS: Record<string, unknown[]> = {
  c5: [
    { id: 's5a', name: 'A', classTeacher: { id: 't-1', name: 'Tina Teacher' } },
    { id: 's5b', name: 'B', classTeacher: { id: 't-2', name: 'Owen Other' } },
  ],
  c6: [{ id: 's6a', name: 'A', classTeacher: null }],
}

const ROSTER_3: Student[] = [
  { id: 'st-1', name: 'Nina Castillo' },
  { id: 'st-2', name: 'Tomas Weber' },
  { id: 'st-3', name: 'Freya Lindqvist' },
]

const PAST_DATE = '2026-01-05'
const FUTURE_DATE = '2099-01-01'

interface Fixture {
  sectionsByClass: Record<string, unknown[]>
  // keyed by `${sectionId}__${date}` — the exact GET /attendance/admin/sections/:id/days/:date body.
  attendance: Record<string, Record<string, unknown>>
}

/** Not-marked-yet shape: every roster student present with `status: null`. */
function notMarked(roster: Student[], locked: boolean) {
  return { submitted: false, locked, entries: roster.map((student) => ({ student, status: null })) }
}

/** Recorded-session shape: one entry per roster student, with its stored status and (optional) audit log. */
function markedDay(
  roster: Student[],
  statuses: Record<string, EntryStatus>,
  meta: { submittedBy: { id: string; name: string }; submittedAt: string; locked: boolean },
  edits: AuditRow[] = [],
) {
  return {
    submitted: true,
    locked: meta.locked,
    submittedBy: meta.submittedBy,
    submittedAt: meta.submittedAt,
    entries: roster.map((student) => ({ student, status: statuses[student.id] })),
    edits,
  }
}

function defaultFixture(): Fixture {
  return { sectionsByClass: SECTIONS_BY_CLASS, attendance: {} }
}

function setupGet(fixture: Fixture) {
  mockApi.get.mockImplementation((path: string) => {
    if (path === '/classes') return Promise.resolve(CLASSES)

    const sections = /^\/classes\/([^/]+)\/sections$/.exec(path)
    if (sections) return Promise.resolve(fixture.sectionsByClass[sections[1]] ?? [])

    const day = /^\/attendance\/admin\/sections\/([^/]+)\/days\/([^/]+)$/.exec(path)
    if (day) {
      const record = fixture.attendance[`${day[1]}__${day[2]}`]
      if (record) return Promise.resolve(record)
      // No fixture configured for this section+date — mirror the real admin GET endpoint, which
      // always resolves 200 (never 404) with a non-empty roster defaulted to "not marked yet".
      return Promise.resolve(notMarked(ROSTER_3, true))
    }

    return Promise.reject(new Error(`unexpected GET ${path}`))
  })
}

function renderPage(user: AuthUser = admin) {
  const props = { user, onBack: vi.fn(), onSignOut: vi.fn() }
  const view = render(<AttendancePage {...props} />)
  return { props, ...view }
}

async function waitForBrowseReady() {
  await waitFor(() => expect(document.getElementById('browse-section')).not.toBeNull())
}

function browseSectionSelect(): HTMLSelectElement {
  return document.getElementById('browse-section') as HTMLSelectElement
}

function browseDateInput(): HTMLInputElement {
  return document.getElementById('browse-date') as HTMLInputElement
}

function selectBrowse(sectionId: string, date: string) {
  fireEvent.change(browseSectionSelect(), { target: { value: sectionId } })
  fireEvent.change(browseDateInput(), { target: { value: date } })
}

function studentRow(name: string): HTMLElement {
  return screen.getByText(name).closest('li') as HTMLElement
}

function lastPatchEntries(): Record<string, string> {
  const call = mockApi.patch.mock.calls.at(-1)
  const entries = (call?.[1] as { entries?: { studentId: string; status: string }[] } | undefined)?.entries ?? []
  return Object.fromEntries(entries.map((e) => [e.studentId, e.status]))
}

beforeEach(() => {
  vi.resetAllMocks()
  setupGet(defaultFixture())
})

// ---------------------------------------------------------------------------
// Page shell (T-004/T-007 regression, adapted to the now-async, API-backed page)
// ---------------------------------------------------------------------------
describe('AttendancePage shell', () => {
  it('AC-01.1 header shows the GraduationCap icon and "Brainx School" text', async () => {
    renderPage()
    await waitForBrowseReady()
    const header = screen.getByRole('banner')

    expect(within(header).getByText('Brainx School')).toBeInTheDocument()
    expect(document.querySelectorAll('.lucide-graduation-cap').length).toBeGreaterThan(0)
  })

  it('AC-01.2 header shows only a Sign out button, with no Profile button', async () => {
    const { props } = renderPage()
    await waitForBrowseReady()
    const header = screen.getByRole('banner')

    const signOutButton = within(header).getByRole('button', { name: /sign out/i })
    expect(within(header).queryByRole('button', { name: /^profile$/i })).not.toBeInTheDocument()

    fireEvent.click(signOutButton)
    expect(props.onSignOut).toHaveBeenCalledTimes(1)
  })

  it('AC-01.5 clicking "Back to dashboard" calls onBack', async () => {
    const { props } = renderPage()
    await waitForBrowseReady()
    fireEvent.click(screen.getByText(/back to dashboard/i))
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })

  it('own addition: preserves the max-w-5xl content width used before the DashboardShell migration', async () => {
    renderPage()
    await waitForBrowseReady()
    const heading = screen.getByRole('heading', { name: /^attendance$/i })
    expect(heading.closest('.max-w-5xl')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Report tables below "Browse & edit" are T-037 (still mock-data) and out of scope for T-035 —
// left completely untouched, including this pre-existing regression test.
// ---------------------------------------------------------------------------
describe('AttendancePage (T-007 badge/roster/edit-mode regression)', () => {
  const defaultSectionId = SECTION_OPTIONS[0]?.id ?? ''

  it('UC-03-E1 shows "—" (never NaN) for every student when zero days are marked in the month', async () => {
    renderPage()
    await waitForBrowseReady()

    const monthInput = document.getElementById('monthly-month') as HTMLInputElement
    fireEvent.change(monthInput, { target: { value: '2099-01' } })

    const roster = rosterFor(defaultSectionId)
    expect(roster.length).toBeGreaterThan(0)

    const dashes = screen.getAllByText('—')
    expect(dashes).toHaveLength(roster.length)
    expect(screen.queryByText(/nan/i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Admin section picker: every section, unfiltered (T-035 technical notes)
// ---------------------------------------------------------------------------
describe('AttendancePage admin section picker (T-035 technical notes)', () => {
  it('own addition: lists every section across every class, unfiltered by class-teacher ownership', async () => {
    renderPage()
    await waitForBrowseReady()

    const optionLabels = Array.from(browseSectionSelect().options).map((o) => o.textContent)
    expect(optionLabels).toEqual(expect.arrayContaining(['Grade 5 - A', 'Grade 5 - B', 'Grade 6 - A']))

    expect(mockApi.get).toHaveBeenCalledWith('/classes')
    expect(mockApi.get).toHaveBeenCalledWith('/classes/c5/sections')
    expect(mockApi.get).toHaveBeenCalledWith('/classes/c6/sections')
  })

  it('own addition: switching sections reloads that section\'s day via the admin endpoint', async () => {
    const fixture = defaultFixture()
    fixture.attendance[`s5a__${PAST_DATE}`] = markedDay(
      ROSTER_3,
      { 'st-1': 'present', 'st-2': 'present', 'st-3': 'present' },
      { submittedBy: { id: 't-1', name: 'Tina Teacher' }, submittedAt: `${PAST_DATE}T08:15:00.000Z`, locked: true },
    )
    fixture.attendance[`s5b__${PAST_DATE}`] = markedDay(
      [{ id: 'st-9', name: 'Priya Rao' }],
      { 'st-9': 'present' },
      { submittedBy: { id: 't-2', name: 'Owen Other' }, submittedAt: `${PAST_DATE}T08:15:00.000Z`, locked: true },
    )
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    selectBrowse('s5a', PAST_DATE)
    await screen.findByText('Nina Castillo')

    fireEvent.change(browseSectionSelect(), { target: { value: 's5b' } })

    await screen.findByText('Priya Rao')
    expect(screen.queryByText('Nina Castillo')).not.toBeInTheDocument()
    expect(mockApi.get).toHaveBeenCalledWith(`/attendance/admin/sections/s5b/days/${PAST_DATE}`)
  })
})

// ---------------------------------------------------------------------------
// UC-06: Admin views attendance for a section/day
// ---------------------------------------------------------------------------
describe('AttendancePage browse & edit (UC-06)', () => {
  it('AC-06.1 a recorded session shows every student\'s status, who submitted it and when, and the edit log', async () => {
    const editedAt = `${PAST_DATE}T10:00:00.000Z`
    const fixture = defaultFixture()
    fixture.attendance[`s5a__${PAST_DATE}`] = markedDay(
      ROSTER_3,
      { 'st-1': 'present', 'st-2': 'absent', 'st-3': 'leave' },
      { submittedBy: { id: 't-1', name: 'Tina Teacher' }, submittedAt: `${PAST_DATE}T08:15:00.000Z`, locked: true },
      [
        {
          studentId: 'st-2',
          fromStatus: 'present',
          toStatus: 'absent',
          editedById: otherAdmin.id,
          editedBy: { id: otherAdmin.id, name: otherAdmin.name },
          editedAt,
        },
      ],
    )
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    selectBrowse('s5a', PAST_DATE)

    expect(await screen.findByText('Nina Castillo')).toBeInTheDocument()
    expect(screen.getByText('Tomas Weber')).toBeInTheDocument()
    expect(screen.getByText('Freya Lindqvist')).toBeInTheDocument()
    expect(within(studentRow('Nina Castillo')).getByText('Present')).toBeInTheDocument()
    expect(within(studentRow('Tomas Weber')).getByText('Absent')).toBeInTheDocument()
    expect(within(studentRow('Freya Lindqvist')).getByText('Leave')).toBeInTheDocument()

    const submittedByText = screen.getByText(/Tina Teacher/)
    expect(submittedByText.textContent).toContain(formatDateTimeLabel(`${PAST_DATE}T08:15:00.000Z`))

    // Edit log entry: the only listitem whose text mentions both the old and new status.
    expect(screen.getByText(/edit log/i)).toBeInTheDocument()
    const editEntries = screen
      .getAllByRole('listitem')
      .filter((li) => /present/i.test(li.textContent ?? '') && /absent/i.test(li.textContent ?? ''))
    expect(editEntries).toHaveLength(1)
    expect(editEntries[0].textContent).toContain('Tomas Weber')
    expect(editEntries[0].textContent).toContain(formatDateTimeLabel(editedAt))
    // Cross-admin edit: the backend's `editedBy: {id, name}` join resolves to the OTHER admin's
    // real name, not the currently logged-in admin's name.
    expect(editEntries[0].textContent).toContain(otherAdmin.name)
  })

  it('own addition: falls back to the bare id when an edit row has neither editedBy nor a self-match', async () => {
    const editedAt = `${PAST_DATE}T12:00:00.000Z`
    const fixture = defaultFixture()
    fixture.attendance[`s5a__${PAST_DATE}`] = markedDay(
      ROSTER_3,
      { 'st-1': 'present', 'st-2': 'absent', 'st-3': 'present' },
      { submittedBy: { id: 't-1', name: 'Tina Teacher' }, submittedAt: `${PAST_DATE}T08:15:00.000Z`, locked: true },
      // No `editedBy` join and `editedById` doesn't match the logged-in admin ("admin-1") — the
      // component's last-resort path renders the bare id.
      [{ studentId: 'st-2', fromStatus: 'present', toStatus: 'absent', editedById: 'admin-9', editedAt }],
    )
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    selectBrowse('s5a', PAST_DATE)
    await screen.findByText('Nina Castillo')

    const editEntries = screen
      .getAllByRole('listitem')
      .filter((li) => /present/i.test(li.textContent ?? '') && /absent/i.test(li.textContent ?? ''))
    expect(editEntries).toHaveLength(1)
    expect(editEntries[0].textContent).toContain('admin-9')
  })

  it('AC-06.2 shows "Not marked yet" (not an error) for a section/date with no recorded session', async () => {
    renderPage()
    await waitForBrowseReady()
    selectBrowse('s5a', PAST_DATE)

    expect(await screen.findByText(/not marked yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('UC-06-E1 a future date filter shows "Not marked yet" rather than an error', async () => {
    renderPage()
    await waitForBrowseReady()
    selectBrowse('s5a', FUTURE_DATE)

    expect(await screen.findByText(/not marked yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('UC-06-E2 a section with zero enrolled students shows an empty roster without crashing', async () => {
    const fixture = defaultFixture()
    fixture.attendance[`s6a__${PAST_DATE}`] = { submitted: false, locked: true, entries: [] }
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    selectBrowse('s6a', PAST_DATE)

    expect(await screen.findByText('No students enrolled.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('own addition: does not show a "Roll no." column (no roll-number field in real data)', async () => {
    const fixture = defaultFixture()
    fixture.attendance[`s5a__${PAST_DATE}`] = markedDay(
      ROSTER_3,
      { 'st-1': 'present', 'st-2': 'present', 'st-3': 'absent' },
      { submittedBy: { id: 't-1', name: 'Tina Teacher' }, submittedAt: `${PAST_DATE}T08:15:00.000Z`, locked: true },
    )
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    selectBrowse('s5a', PAST_DATE)

    await screen.findByText('Nina Castillo')
    expect(screen.queryByText(/Roll no\./i)).not.toBeInTheDocument()
  })

  it('own addition: cancels edit mode automatically when the admin changes the section mid-edit', async () => {
    const fixture = defaultFixture()
    fixture.attendance[`s5a__${PAST_DATE}`] = markedDay(
      ROSTER_3,
      { 'st-1': 'present', 'st-2': 'present', 'st-3': 'present' },
      { submittedBy: { id: 't-1', name: 'Tina Teacher' }, submittedAt: `${PAST_DATE}T08:15:00.000Z`, locked: true },
    )
    fixture.attendance[`s5b__${PAST_DATE}`] = markedDay(
      [{ id: 'st-9', name: 'Priya Rao' }],
      { 'st-9': 'present' },
      { submittedBy: { id: 't-2', name: 'Owen Other' }, submittedAt: `${PAST_DATE}T08:15:00.000Z`, locked: true },
    )
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    selectBrowse('s5a', PAST_DATE)
    await screen.findByText('Nina Castillo')

    fireEvent.click(screen.getByRole('button', { name: /edit this day/i }))
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()

    fireEvent.change(browseSectionSelect(), { target: { value: 's5b' } })

    await screen.findByText('Priya Rao')
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit this day/i })).toBeInTheDocument()
  })

  it('own addition: cancels edit mode automatically when the admin changes the date mid-edit', async () => {
    const fixture = defaultFixture()
    fixture.attendance[`s5a__${PAST_DATE}`] = markedDay(
      ROSTER_3,
      { 'st-1': 'present', 'st-2': 'present', 'st-3': 'present' },
      { submittedBy: { id: 't-1', name: 'Tina Teacher' }, submittedAt: `${PAST_DATE}T08:15:00.000Z`, locked: true },
    )
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    selectBrowse('s5a', PAST_DATE)
    await screen.findByText('Nina Castillo')

    fireEvent.click(screen.getByRole('button', { name: /edit this day/i }))
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()

    fireEvent.change(browseDateInput(), { target: { value: FUTURE_DATE } })

    expect(await screen.findByText(/not marked yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Clearing the date input (code-review fix, mirrors MarkAttendancePage's analogous guard)
// ---------------------------------------------------------------------------
describe('AttendancePage date input (code-review fix)', () => {
  it('own addition: clearing the date input clears the stale day instead of leaving it editable', async () => {
    const fixture = defaultFixture()
    fixture.attendance[`s5a__${PAST_DATE}`] = markedDay(
      ROSTER_3,
      { 'st-1': 'present', 'st-2': 'present', 'st-3': 'present' },
      { submittedBy: { id: 't-1', name: 'Tina Teacher' }, submittedAt: `${PAST_DATE}T08:15:00.000Z`, locked: true },
    )
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    selectBrowse('s5a', PAST_DATE)
    await screen.findByText('Nina Castillo')
    expect(screen.getByRole('button', { name: /edit this day/i })).toBeInTheDocument()
    mockApi.get.mockClear()

    fireEvent.change(browseDateInput(), { target: { value: '' } })

    // Give any (incorrectly) fired request a tick to resolve/reject before asserting it never happened.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockApi.get).not.toHaveBeenCalled()
    // The stale day is cleared out rather than left on screen with "Edit this day" still enabled.
    expect(screen.queryByText('Nina Castillo')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit this day/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
  })

  it('own addition: saveEditing never fires with an invalid date even if isEditing were somehow still true', async () => {
    const fixture = defaultFixture()
    fixture.attendance[`s5a__${PAST_DATE}`] = markedDay(
      ROSTER_3,
      { 'st-1': 'present', 'st-2': 'present', 'st-3': 'present' },
      { submittedBy: { id: 't-1', name: 'Tina Teacher' }, submittedAt: `${PAST_DATE}T08:15:00.000Z`, locked: true },
    )
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    selectBrowse('s5a', PAST_DATE)
    await screen.findByText('Nina Castillo')

    fireEvent.click(screen.getByRole('button', { name: /edit this day/i }))
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()

    fireEvent.change(browseDateInput(), { target: { value: '' } })

    // Clearing the date exits edit mode entirely (canEdit is gated on a valid date), so there's no
    // "Save changes" button left to click — and if a save were somehow still triggered, it must not
    // reach the PATCH call.
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    expect(mockApi.patch).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// UC-05: Admin edits attendance for any day, with audit log
// ---------------------------------------------------------------------------
describe('AttendancePage admin edit + audit log (UC-05)', () => {
  it('AC-05.3 saving an edit shows old status, new status, editor name and timestamp in the edit log, one entry per changed student', async () => {
    const fixture = defaultFixture()
    fixture.attendance[`s5a__${PAST_DATE}`] = markedDay(
      ROSTER_3,
      { 'st-1': 'present', 'st-2': 'present', 'st-3': 'present' },
      { submittedBy: { id: 't-1', name: 'Tina Teacher' }, submittedAt: `${PAST_DATE}T08:15:00.000Z`, locked: true },
    )
    setupGet(fixture)

    const editedAt1 = `${PAST_DATE}T11:00:00.000Z`
    const editedAt2 = `${PAST_DATE}T11:00:05.000Z`
    mockApi.patch.mockResolvedValue(
      markedDay(
        ROSTER_3,
        { 'st-1': 'absent', 'st-2': 'leave', 'st-3': 'present' },
        { submittedBy: { id: 't-1', name: 'Tina Teacher' }, submittedAt: `${PAST_DATE}T08:15:00.000Z`, locked: true },
        [
          // Backend joins `editedBy` on the admin's own edit too — exercises the `editedBy.name`
          // resolution path (not just the self-match fallback).
          {
            studentId: 'st-1',
            fromStatus: 'present',
            toStatus: 'absent',
            editedById: admin.id,
            editedBy: { id: admin.id, name: admin.name },
            editedAt: editedAt1,
          },
          // No `editedBy` here — keeps the self-match fallback path (`editedById === user.id` ->
          // use the logged-in user's own name) covered.
          { studentId: 'st-2', fromStatus: 'present', toStatus: 'leave', editedById: admin.id, editedAt: editedAt2 },
        ],
      ),
    )

    renderPage()
    await waitForBrowseReady()
    selectBrowse('s5a', PAST_DATE)
    await screen.findByText('Nina Castillo')

    fireEvent.click(screen.getByRole('button', { name: /edit this day/i }))
    fireEvent.click(within(studentRow('Nina Castillo')).getByRole('button', { name: 'Absent' }))
    fireEvent.click(within(studentRow('Tomas Weber')).getByRole('button', { name: 'Leave' }))
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(mockApi.patch).toHaveBeenCalledWith(`/attendance/admin/sections/s5a/days/${PAST_DATE}`, {
        entries: expect.any(Array),
      }),
    )
    const sentEntries = lastPatchEntries()
    expect(sentEntries['st-1']).toBe('absent')
    expect(sentEntries['st-2']).toBe('leave')

    // One edit-log entry per changed student (identified by mentioning both an old and a new status).
    const editEntries = (
      await screen.findAllByRole('listitem')
    ).filter((li) => /present/i.test(li.textContent ?? '') && /(absent|leave)/i.test(li.textContent ?? ''))
    expect(editEntries).toHaveLength(2)

    const ninaEdit = editEntries.find((li) => li.textContent?.includes('Nina Castillo'))
    expect(ninaEdit?.textContent).toContain('Present')
    expect(ninaEdit?.textContent).toContain('Absent')
    expect(ninaEdit?.textContent).toContain(admin.name)
    expect(ninaEdit?.textContent).toContain(formatDateTimeLabel(editedAt1))

    const tomasEdit = editEntries.find((li) => li.textContent?.includes('Tomas Weber'))
    expect(tomasEdit?.textContent).toContain('Present')
    expect(tomasEdit?.textContent).toContain('Leave')
    expect(tomasEdit?.textContent).toContain(admin.name)
    expect(tomasEdit?.textContent).toContain(formatDateTimeLabel(editedAt2))
  })
})
