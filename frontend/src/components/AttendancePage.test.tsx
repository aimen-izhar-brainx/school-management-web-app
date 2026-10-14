import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { AttendancePage } from './AttendancePage'
import type { AuthUser } from '../lib/auth'
import { api } from '../lib/http'
import { currentMonthKey, formatDateTimeLabel, mostRecentSchoolDay } from '../data/attendance'

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
const MONTH = '2026-02'
const FUTURE_MONTH = '2099-01'

type DailyReportRow = {
  section: { id: string; name: string }
  summary: { present: number; absent: number; leave: number } | null
}
type MonthlyReportRow = {
  student: { id: string; name: string }
  present: number
  absent: number
  leave: number
  markedDays: number
  percentage: number | null
}

interface Fixture {
  sectionsByClass: Record<string, unknown[]>
  // keyed by `${sectionId}__${date}` — the exact GET /attendance/admin/sections/:id/days/:date body.
  attendance: Record<string, Record<string, unknown>>
  // keyed by the `date` query param — the exact GET /attendance/reports/daily?date= body (T-036/T-037).
  daily: Record<string, DailyReportRow[]>
  // keyed by `${sectionId}__${month}` — the exact GET /attendance/reports/monthly?sectionId=&month= body (T-036/T-037).
  monthly: Record<string, MonthlyReportRow[]>
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
  return { sectionsByClass: SECTIONS_BY_CLASS, attendance: {}, daily: {}, monthly: {} }
}

function setupGet(fixture: Fixture) {
  mockApi.get.mockImplementation((path: string) => {
    const [base, queryString] = path.split('?')
    const params = new URLSearchParams(queryString ?? '')

    if (base === '/classes') return Promise.resolve(CLASSES)

    const sections = /^\/classes\/([^/]+)\/sections$/.exec(base)
    if (sections) return Promise.resolve(fixture.sectionsByClass[sections[1]] ?? [])

    const day = /^\/attendance\/admin\/sections\/([^/]+)\/days\/([^/]+)$/.exec(base)
    if (day) {
      const record = fixture.attendance[`${day[1]}__${day[2]}`]
      if (record) return Promise.resolve(record)
      // No fixture configured for this section+date — mirror the real admin GET endpoint, which
      // always resolves 200 (never 404) with a non-empty roster defaulted to "not marked yet".
      return Promise.resolve(notMarked(ROSTER_3, true))
    }

    // T-037: daily summary report (UC-08). Defaults to `[]` when the test hasn't configured this
    // exact date, so unrelated tests mounting the whole page (which now also triggers this fetch
    // on mount) don't blow up with an unhandled rejection.
    if (base === '/attendance/reports/daily') {
      const date = params.get('date') ?? ''
      return Promise.resolve(fixture.daily[date] ?? [])
    }

    // T-037: monthly percentage report (UC-09). Same empty-default rationale as above.
    if (base === '/attendance/reports/monthly') {
      const sectionId = params.get('sectionId') ?? ''
      const month = params.get('month') ?? ''
      return Promise.resolve(fixture.monthly[`${sectionId}__${month}`] ?? [])
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

// ---------------------------------------------------------------------------
// T-037 report-table helpers
// ---------------------------------------------------------------------------
function summaryDateInput(): HTMLInputElement {
  return document.getElementById('summary-date') as HTMLInputElement
}

function monthlySectionSelect(): HTMLSelectElement {
  return document.getElementById('monthly-section') as HTMLSelectElement
}

function monthlyMonthInput(): HTMLInputElement {
  return document.getElementById('monthly-month') as HTMLInputElement
}

function dailySummarySection(): HTMLElement {
  return screen.getByText(/daily summary per class/i).closest('section') as HTMLElement
}

function monthlySection(): HTMLElement {
  return screen.getByText(/monthly attendance percentage per student/i).closest('section') as HTMLElement
}

/** Every `<tr>` in a report table, excluding the header row. */
function bodyRows(container: HTMLElement): HTMLElement[] {
  return within(container)
    .getAllByRole('row')
    .slice(1) as HTMLElement[]
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
// NOTE (T-037): the pre-existing "T-007 badge/roster/edit-mode regression" describe block that
// used to live here exercised the monthly table's OLD mock-data path directly (`rosterFor()` /
// `SECTION_OPTIONS[0]` / `monthlyStatsForSection`), which T-037 replaces with real API data below.
// Its behavioral guarantee — zero marked days in the selected month never renders "0%" or "NaN" —
// is superseded by 'AC-09.2'/'UC-09-E1' in the "AttendancePage monthly percentage (UC-09)" describe
// further down, now driven by `GET /attendance/reports/monthly` instead of the mock dataset.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// T-037: wires the "Daily summary" and "Monthly attendance percentage" report tables to
// `GET /attendance/reports/daily?date=` and `GET /attendance/reports/monthly?sectionId=&month=`.
//
// UI CONTRACT:
//  - Daily summary: on mount (for the default `summaryDate`), and whenever `#summary-date`
//    changes, fetches `GET /attendance/reports/daily?date=<value>` via a `useEffect` keyed on
//    `[summaryDate]` (mirroring "Browse & edit"'s `loadDay` effect, including its
//    request-id-ref-guard idiom), whose response is an array of
//    `{ section: { id, name }, summary: { present, absent, leave } | null }` — one row per
//    section in the whole school (not scoped to any one picker). A row whose `summary` is `null`
//    renders "Not marked yet" instead of numeric counts (AC-08.2, UC-08-E1). While loading, the
//    table body shows a "Loading..." row.
//  - Monthly percentage: `#monthly-section` is populated from the same real section directory
//    already fetched for "Browse & edit" (same ids as `#browse-section`), replacing today's
//    hardcoded `SECTION_OPTIONS` mock list — there is no other source of a real backend section id
//    for this picker. On mount (once the directory sets a default `monthlySectionId`), and
//    whenever `#monthly-section` or `#monthly-month` changes, fetches
//    `GET /attendance/reports/monthly?sectionId=<id>&month=<value>` via a `useEffect` keyed on
//    `[monthlySectionId, monthKey]` (same ref-guard idiom), whose response is an array of
//    `{ student: { id, name }, present, absent, leave, markedDays, percentage: number | null }` —
//    one row per currently enrolled student. `percentage === null` renders "—" (AC-09.2, UC-09-E1);
//    an empty array renders "No students enrolled." (UC-09-E2). While loading, the table body
//    shows a "Loading..." row.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Code-review fix: both report tables must load on initial mount for the already-valid default
// values, not only after the admin touches a control.
// ---------------------------------------------------------------------------
describe('AttendancePage report tables load on mount (code-review fix)', () => {
  it('own addition: fetches the daily report for the default summary date without any user interaction', async () => {
    const fixture = defaultFixture()
    const today = mostRecentSchoolDay()
    fixture.daily[today] = [{ section: { id: 's5a', name: 'A' }, summary: { present: 1, absent: 0, leave: 0 } }]
    setupGet(fixture)

    renderPage()

    await waitFor(() => {
      const call = mockApi.get.mock.calls.findLast((call) => (call[0] as string).startsWith('/attendance/reports/daily'))
      expect(call).toBeDefined()
      const params = new URLSearchParams((call![0] as string).split('?')[1] ?? '')
      expect(params.get('date')).toBe(today)
    })

    const section = dailySummarySection()
    await waitFor(() => expect(bodyRows(section)).toHaveLength(1))
  })

  it('own addition: fetches the monthly report for the directory-driven default section/month without any user interaction', async () => {
    const fixture = defaultFixture()
    const month = currentMonthKey()
    fixture.monthly[`s5a__${month}`] = [
      { student: { id: 'st-601', name: 'Isla Novak' }, present: 2, absent: 0, leave: 0, markedDays: 2, percentage: 100 },
    ]
    setupGet(fixture)

    renderPage()

    await waitFor(() => {
      const call = mockApi.get.mock.calls.findLast((call) =>
        (call[0] as string).startsWith('/attendance/reports/monthly'),
      )
      expect(call).toBeDefined()
      const params = new URLSearchParams((call![0] as string).split('?')[1] ?? '')
      expect(params.get('sectionId')).toBe('s5a')
      expect(params.get('month')).toBe(month)
    })

    expect(await screen.findByText('Isla Novak')).toBeInTheDocument()
  })
})

describe('AttendancePage daily summary (UC-08)', () => {
  it('AC-08.2 a section with no recorded session for the date shows "Not marked yet" instead of zeros', async () => {
    const fixture = defaultFixture()
    fixture.daily[PAST_DATE] = [
      { section: { id: 's5a', name: 'A' }, summary: { present: 2, absent: 1, leave: 0 } },
      { section: { id: 's5b', name: 'B' }, summary: null },
    ]
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    fireEvent.change(summaryDateInput(), { target: { value: PAST_DATE } })

    const section = dailySummarySection()
    await waitFor(() => expect(bodyRows(section)).toHaveLength(2))

    const rows = bodyRows(section)
    const notMarkedRows = rows.filter((row) => /not marked yet/i.test(row.textContent ?? ''))
    expect(notMarkedRows).toHaveLength(1)

    // The marked section's row shows its real counts (2 present, 1 absent, 0 leave), not a
    // placeholder — distinguishing "no absences" (a real zero) from "nothing submitted" (null).
    const markedRow = rows.find((row) => !/not marked yet/i.test(row.textContent ?? ''))
    expect(markedRow).toBeDefined()
    expect(within(markedRow as HTMLElement).getByText('2')).toBeInTheDocument()
    expect(within(markedRow as HTMLElement).getByText('1')).toBeInTheDocument()
    expect(within(markedRow as HTMLElement).getByText('0')).toBeInTheDocument()
  })

  it('UC-08-E1 a future date shows "Not marked yet" for every section, not zeros', async () => {
    const fixture = defaultFixture()
    fixture.daily[FUTURE_DATE] = [
      { section: { id: 's5a', name: 'A' }, summary: null },
      { section: { id: 's5b', name: 'B' }, summary: null },
      { section: { id: 's6a', name: 'A' }, summary: null },
    ]
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    fireEvent.change(summaryDateInput(), { target: { value: FUTURE_DATE } })

    // Confirms the page actually re-fetched the real report for this exact future date, rather
    // than coincidentally showing "Not marked yet" because the mock dataset has no seeded entries
    // that far out (which it wouldn't catch a component that never wired the real endpoint at all).
    await waitFor(() => {
      const call = mockApi.get.mock.calls.findLast((call) => (call[0] as string).startsWith('/attendance/reports/daily'))
      expect(call).toBeDefined()
      const params = new URLSearchParams((call![0] as string).split('?')[1] ?? '')
      expect(params.get('date')).toBe(FUTURE_DATE)
    })

    const section = dailySummarySection()
    await waitFor(() => expect(bodyRows(section)).toHaveLength(3))

    const rows = bodyRows(section)
    for (const row of rows) {
      expect(/not marked yet/i.test(row.textContent ?? '')).toBe(true)
    }
    expect(within(section).queryByText(/^0$/)).not.toBeInTheDocument()
  })

  it('own addition: fetches the daily report for the selected date (not the mock dataset)', async () => {
    const fixture = defaultFixture()
    fixture.daily[PAST_DATE] = [{ section: { id: 's5a', name: 'A' }, summary: { present: 1, absent: 0, leave: 0 } }]
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    fireEvent.change(summaryDateInput(), { target: { value: PAST_DATE } })

    await waitFor(() => {
      const call = mockApi.get.mock.calls.findLast((call) => (call[0] as string).startsWith('/attendance/reports/daily'))
      expect(call).toBeDefined()
      const params = new URLSearchParams((call![0] as string).split('?')[1] ?? '')
      expect(params.get('date')).toBe(PAST_DATE)
    })
  })
})

describe('AttendancePage monthly percentage (UC-09)', () => {
  it('AC-09.2 a student with zero marked days in the selected month shows "—", not 0% or an error', async () => {
    const fixture = defaultFixture()
    fixture.monthly[`s6a__${MONTH}`] = [
      { student: { id: 'st-601', name: 'Isla Novak' }, present: 3, absent: 0, leave: 0, markedDays: 3, percentage: 100 },
      { student: { id: 'st-602', name: 'Mateo Alvarez' }, present: 0, absent: 0, leave: 0, markedDays: 0, percentage: null },
    ]
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    fireEvent.change(monthlySectionSelect(), { target: { value: 's6a' } })
    fireEvent.change(monthlyMonthInput(), { target: { value: MONTH } })

    await screen.findByText('Isla Novak')
    const mateoRow = screen.getByText('Mateo Alvarez').closest('tr') as HTMLElement
    expect(within(mateoRow).getByText('—')).toBeInTheDocument()
    expect(within(mateoRow).queryByText('0%')).not.toBeInTheDocument()
    expect(within(mateoRow).queryByText(/nan/i)).not.toBeInTheDocument()
    // present/absent/leave/markedDays are all real zeros, still shown as "0" (not hidden/dashed).
    expect(within(mateoRow).getAllByText('0')).toHaveLength(4)

    const islaRow = screen.getByText('Isla Novak').closest('tr') as HTMLElement
    expect(within(islaRow).getByText('100%')).toBeInTheDocument()
  })

  it('UC-09-E1 a future month shows 0 marked days and "—" percentage for every student', async () => {
    const fixture = defaultFixture()
    fixture.monthly[`s6a__${FUTURE_MONTH}`] = [
      { student: { id: 'st-601', name: 'Isla Novak' }, present: 0, absent: 0, leave: 0, markedDays: 0, percentage: null },
      { student: { id: 'st-602', name: 'Mateo Alvarez' }, present: 0, absent: 0, leave: 0, markedDays: 0, percentage: null },
    ]
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    fireEvent.change(monthlySectionSelect(), { target: { value: 's6a' } })
    fireEvent.change(monthlyMonthInput(), { target: { value: FUTURE_MONTH } })

    await screen.findByText('Isla Novak')
    const table = monthlySection()
    const rows = bodyRows(table)
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(within(row).getByText('—')).toBeInTheDocument()
      expect(within(row).queryByText(/nan/i)).not.toBeInTheDocument()
      expect(within(row).queryByText('0%')).not.toBeInTheDocument()
    }
  })

  it('UC-09-E2 a section with zero enrolled students shows "No students enrolled."', async () => {
    const fixture = defaultFixture()
    fixture.monthly[`s6a__${MONTH}`] = []
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    fireEvent.change(monthlySectionSelect(), { target: { value: 's6a' } })
    fireEvent.change(monthlyMonthInput(), { target: { value: MONTH } })

    // Confirms the real endpoint was actually queried for this section+month — otherwise a
    // component that never wired the endpoint at all could still coincidentally land on an empty
    // state (e.g. an invalid/unselected section falling back to an empty mock roster) without this
    // check catching that it isn't really using the real report.
    await waitFor(() => {
      const call = mockApi.get.mock.calls.findLast((call) =>
        (call[0] as string).startsWith('/attendance/reports/monthly'),
      )
      expect(call).toBeDefined()
      const params = new URLSearchParams((call![0] as string).split('?')[1] ?? '')
      expect(params.get('sectionId')).toBe('s6a')
      expect(params.get('month')).toBe(MONTH)
    })

    const table = monthlySection()
    expect(await within(table).findByText(/no students enrolled/i)).toBeInTheDocument()
    expect(bodyRows(table).filter((row) => !/no students enrolled/i.test(row.textContent ?? ''))).toHaveLength(0)
  })

  it('own addition: fetches the monthly report for the selected section and month (not the mock dataset)', async () => {
    const fixture = defaultFixture()
    fixture.monthly[`s6a__${MONTH}`] = [
      { student: { id: 'st-601', name: 'Isla Novak' }, present: 2, absent: 0, leave: 0, markedDays: 2, percentage: 100 },
    ]
    setupGet(fixture)

    renderPage()
    await waitForBrowseReady()
    fireEvent.change(monthlySectionSelect(), { target: { value: 's6a' } })
    fireEvent.change(monthlyMonthInput(), { target: { value: MONTH } })

    await waitFor(() => {
      const call = mockApi.get.mock.calls.findLast((call) =>
        (call[0] as string).startsWith('/attendance/reports/monthly'),
      )
      expect(call).toBeDefined()
      const params = new URLSearchParams((call![0] as string).split('?')[1] ?? '')
      expect(params.get('sectionId')).toBe('s6a')
      expect(params.get('month')).toBe(MONTH)
    })
    await screen.findByText('Isla Novak')
  })
})

// ---------------------------------------------------------------------------
// Code-review fix: clearing a report filter mid-flight must bump the request-id ref so a
// still-in-flight (now-stale) response gets discarded instead of repopulating the table after the
// input has already been cleared.
// ---------------------------------------------------------------------------
describe('AttendancePage report tables stale-request race guard (code-review fix)', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((res) => {
      resolve = res
    })
    return { promise, resolve }
  }

  it('own addition: clearing the summary date mid-flight discards the stale daily report response', async () => {
    const fixture = defaultFixture()
    setupGet(fixture)
    renderPage()
    await waitForBrowseReady()

    const pending = deferred<DailyReportRow[]>()
    const baseGet = mockApi.get.getMockImplementation() as (path: string) => Promise<unknown>
    mockApi.get.mockImplementation((path: string) => {
      if (path === `/attendance/reports/daily?date=${PAST_DATE}`) return pending.promise
      return baseGet(path)
    })

    fireEvent.change(summaryDateInput(), { target: { value: PAST_DATE } })
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith(`/attendance/reports/daily?date=${PAST_DATE}`))

    // Clear the date before the in-flight request for PAST_DATE resolves.
    fireEvent.change(summaryDateInput(), { target: { value: '' } })
    expect(await screen.findByText(/select a date/i)).toBeInTheDocument()

    await act(async () => {
      pending.resolve([{ section: { id: 's5a', name: 'A' }, summary: { present: 2, absent: 1, leave: 0 } }])
    })

    // The stale response must not repopulate the table now that the date input is empty.
    expect(screen.getByText(/select a date/i)).toBeInTheDocument()
    const section = dailySummarySection()
    expect(within(section).queryByText('2')).not.toBeInTheDocument()
  })

  it('own addition: clearing the month mid-flight discards the stale monthly report response', async () => {
    const fixture = defaultFixture()
    setupGet(fixture)
    renderPage()
    await waitForBrowseReady()

    const pending = deferred<MonthlyReportRow[]>()
    const baseGet = mockApi.get.getMockImplementation() as (path: string) => Promise<unknown>
    mockApi.get.mockImplementation((path: string) => {
      if (path === `/attendance/reports/monthly?sectionId=s5a&month=${MONTH}`) return pending.promise
      return baseGet(path)
    })

    fireEvent.change(monthlySectionSelect(), { target: { value: 's5a' } })
    fireEvent.change(monthlyMonthInput(), { target: { value: MONTH } })
    await waitFor(() =>
      expect(mockApi.get).toHaveBeenCalledWith(`/attendance/reports/monthly?sectionId=s5a&month=${MONTH}`),
    )

    // Clear the month before the in-flight request resolves.
    fireEvent.change(monthlyMonthInput(), { target: { value: '' } })
    expect(await screen.findByText(/select a section/i)).toBeInTheDocument()

    await act(async () => {
      pending.resolve([
        { student: { id: 'st-stale', name: 'Stale Student' }, present: 5, absent: 0, leave: 0, markedDays: 5, percentage: 100 },
      ])
    })

    // The stale response must not repopulate the table now that the month input is empty.
    expect(screen.getByText(/select a section/i)).toBeInTheDocument()
    expect(screen.queryByText('Stale Student')).not.toBeInTheDocument()
  })
})
