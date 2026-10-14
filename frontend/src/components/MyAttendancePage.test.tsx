import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { MyAttendancePage } from './MyAttendancePage'
import type { AuthUser } from '../lib/auth'
import { api } from '../lib/http'
import { currentMonthKey, defaultStudent, formatDateLabel, monthLabel, statusInfo } from '../data/attendance'

// T-039: MyAttendancePage's **student** branch is wired to the real `GET /attendance/me?month=`
// endpoint built in T-038 (UC-10, UC-11, UC-12). The HTTP layer is mocked.
//
// Per the ticket's Technical notes, the mock's `user.role === 'parent'` branch
// (`findStudentByName`/`defaultStudent` + `INITIAL_ATTENDANCE_RECORDS`) stays exactly as-is and
// UNWIRED — it must keep rendering from the mock dataset and must never call the real API. Only
// the student branch is exercised against the real endpoint below.
//
// Real response shape (backend/src/attendance/attendance.service.ts `getMine`, confirmed by
// attendance-me.spec.ts):
//   { section: { id, name } | null, entries: [{ date, status }], present, absent, leave,
//     percentage: number | null }
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
const parentUser: AuthUser = { id: 'parent-1', name: 'Pat Parent', email: 'pat@example.com', role: 'parent' }

type EntryStatus = 'present' | 'absent' | 'leave'
type MeResponse = {
  section: { id: string; name: string } | null
  entries: Array<{ date: string; status: EntryStatus }>
  present: number
  absent: number
  leave: number
  percentage: number | null
}

function meResponse(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    section: { id: 's5a', name: 'A' },
    entries: [],
    present: 0,
    absent: 0,
    leave: 0,
    percentage: null,
    ...overrides,
  }
}

function renderPage(user: AuthUser = studentUser) {
  const props = { user, onBack: vi.fn(), onSignOut: vi.fn() }
  const view = render(<MyAttendancePage {...props} />)
  return { props, ...view }
}

/**
 * The 4-card stats grid ("Attendance %, Present, Absent, Leave). Found via the "Attendance" label,
 * which (unlike "Present"/"Absent"/"Leave") never collides with per-entry status badge text.
 */
function statsGrid(): HTMLElement {
  return screen.getByText('Attendance').closest('.grid') as HTMLElement
}

/**
 * The stat card's wrapping `<div>` for a given label ("Attendance"/"Present"/"Absent"/"Leave"),
 * scoped to the stats grid. Un-scoped `screen.getByText('Present'|'Absent'|'Leave')` would also
 * match an entry row's `AttendanceStatusBadge`, which renders the same literal status label.
 */
function statCard(label: string): HTMLElement {
  return within(statsGrid()).getByText(label).closest('div') as HTMLElement
}

function monthInput(): HTMLInputElement {
  return screen.getByLabelText(/month/i) as HTMLInputElement
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// Shell regression (T-004/T-007), now backed by the real, mocked API
// ---------------------------------------------------------------------------
describe('MyAttendancePage shell (student, now backed by the real API)', () => {
  beforeEach(() => {
    mockApi.get.mockResolvedValue(meResponse())
  })

  it('AC-01.1 header shows the GraduationCap icon and "Brainx School" text', async () => {
    renderPage()
    await screen.findByText('Attendance')
    const header = screen.getByRole('banner')

    expect(within(header).getByText('Brainx School')).toBeInTheDocument()
    expect(document.querySelectorAll('.lucide-graduation-cap').length).toBeGreaterThan(0)
  })

  it('AC-01.2 header shows only a Sign out button, with no Profile button', async () => {
    const { props } = renderPage()
    await screen.findByText('Attendance')
    const header = screen.getByRole('banner')

    const signOutButton = within(header).getByRole('button', { name: /sign out/i })
    expect(within(header).queryByRole('button', { name: /^profile$/i })).not.toBeInTheDocument()

    fireEvent.click(signOutButton)
    expect(props.onSignOut).toHaveBeenCalledTimes(1)
  })

  it('AC-01.5 clicking "Back to dashboard" calls onBack', async () => {
    const { props } = renderPage()
    await screen.findByText('Attendance')
    fireEvent.click(screen.getByText(/back to dashboard/i))
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })

  it('own addition: preserves the max-w-2xl content width used before the DashboardShell migration', async () => {
    renderPage()
    await screen.findByText('Attendance')
    const heading = screen.getByRole('heading', { name: /^my attendance$/i })
    expect(heading.closest('.max-w-2xl')).not.toBeNull()
  })

  it('own addition: fetches GET /attendance/me with the current month on mount', async () => {
    renderPage()
    await screen.findByText('Attendance')
    expect(mockApi.get).toHaveBeenCalledWith(`/attendance/me?month=${currentMonthKey()}`)
  })
})

// ---------------------------------------------------------------------------
// AC-10.2: changing the month selector re-fetches and updates both the list and the stats
// ---------------------------------------------------------------------------
describe('MyAttendancePage month selector (AC-10.2)', () => {
  it('AC-10.2 given the student changes the month selector, the list and stats update to the newly selected month', async () => {
    mockApi.get.mockImplementation((path: string) => {
      const month = new URLSearchParams(path.split('?')[1] ?? '').get('month')
      if (month === '2024-03') {
        return Promise.resolve(
          meResponse({
            entries: [
              { date: '2024-03-01', status: 'present' },
              { date: '2024-03-02', status: 'absent' },
            ],
            present: 1,
            absent: 1,
            leave: 0,
            percentage: 50,
          }),
        )
      }
      if (month === '2024-04') {
        return Promise.resolve(
          meResponse({
            entries: [{ date: '2024-04-01', status: 'leave' }],
            present: 0,
            absent: 0,
            leave: 1,
            percentage: 0,
          }),
        )
      }
      return Promise.resolve(meResponse())
    })

    renderPage()
    await screen.findByText('Attendance')

    fireEvent.change(monthInput(), { target: { value: '2024-03' } })

    await screen.findByText(formatDateLabel('2024-03-01'))
    expect(screen.getByText(formatDateLabel('2024-03-02'))).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: monthLabel('2024-03') })).toBeInTheDocument()
    expect(within(statCard('Present')).getByText('1')).toBeInTheDocument()
    expect(within(statCard('Absent')).getByText('1')).toBeInTheDocument()
    expect(within(statCard('Leave')).getByText('0')).toBeInTheDocument()
    expect(within(statCard('Attendance')).getByText('50%')).toBeInTheDocument()

    fireEvent.change(monthInput(), { target: { value: '2024-04' } })

    await screen.findByText(formatDateLabel('2024-04-01'))
    expect(screen.queryByText(formatDateLabel('2024-03-01'))).not.toBeInTheDocument()
    expect(screen.queryByText(formatDateLabel('2024-03-02'))).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: monthLabel('2024-04') })).toBeInTheDocument()
    expect(within(statCard('Present')).getByText('0')).toBeInTheDocument()
    expect(within(statCard('Leave')).getByText('1')).toBeInTheDocument()
    expect(within(statCard('Attendance')).getByText('0%')).toBeInTheDocument()

    expect(mockApi.get).toHaveBeenCalledWith('/attendance/me?month=2024-03')
    expect(mockApi.get).toHaveBeenCalledWith('/attendance/me?month=2024-04')
  })

  it('own addition: each entry renders the same status badge style/label as AttendancePage, driven by the real response', async () => {
    mockApi.get.mockResolvedValue(
      meResponse({
        entries: [
          { date: '2024-03-01', status: 'present' },
          { date: '2024-03-02', status: 'absent' },
          { date: '2024-03-03', status: 'leave' },
        ],
        present: 1,
        absent: 1,
        leave: 1,
        percentage: 50,
      }),
    )
    renderPage()
    fireEvent.change(await screen.findByLabelText(/month/i), { target: { value: '2024-03' } })
    await screen.findByText(formatDateLabel('2024-03-01'))

    for (const [date, status] of [
      ['2024-03-01', 'present'],
      ['2024-03-02', 'absent'],
      ['2024-03-03', 'leave'],
    ] as const) {
      const row = screen.getByText(formatDateLabel(date)).closest('li') as HTMLElement
      const info = statusInfo(status)
      const badge = within(row).getByText(info.label)
      info.badgeClass.split(' ').forEach((cls) => expect(badge).toHaveClass(cls))
    }
  })
})

// ---------------------------------------------------------------------------
// UC-10-E1 / UC-10-E2: zero marked days (all-unmarked month, or a future month) -> empty state
// ---------------------------------------------------------------------------
describe('MyAttendancePage empty month (UC-10-E1, UC-10-E2)', () => {
  it('UC-10-E1 shows "No attendance marked for this month yet." and "—" percentage when the student has zero marked days in the month', async () => {
    mockApi.get.mockResolvedValue(meResponse({ entries: [], present: 0, absent: 0, leave: 0, percentage: null }))
    renderPage()

    expect(await screen.findByText('No attendance marked for this month yet.')).toBeInTheDocument()
    expect(within(statCard('Attendance')).getByText('—')).toBeInTheDocument()
    expect(within(statCard('Attendance')).queryByText(/%$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/nan/i)).not.toBeInTheDocument()
  })

  it('UC-10-E2 a future month shows the same empty state as UC-10-E1, not an error', async () => {
    mockApi.get.mockImplementation((path: string) => {
      const month = new URLSearchParams(path.split('?')[1] ?? '').get('month')
      if (month === '2099-01') {
        return Promise.resolve(meResponse({ entries: [], present: 0, absent: 0, leave: 0, percentage: null }))
      }
      return Promise.resolve(
        meResponse({ entries: [{ date: '2024-01-01', status: 'present' }], present: 1, percentage: 100 }),
      )
    })
    renderPage()
    await screen.findByText(formatDateLabel('2024-01-01'))

    fireEvent.change(monthInput(), { target: { value: '2099-01' } })

    expect(await screen.findByText('No attendance marked for this month yet.')).toBeInTheDocument()
    expect(within(statCard('Attendance')).getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/nan/i)).not.toBeInTheDocument()
    expect(mockApi.get).toHaveBeenCalledWith('/attendance/me?month=2099-01')
  })
})

// ---------------------------------------------------------------------------
// AC-12.1 / UC-12-E1: student with no section assigned
// ---------------------------------------------------------------------------
describe('MyAttendancePage no section assigned (AC-12.1, UC-12-E1)', () => {
  it('AC-12.1 shows "You are not assigned to a class yet." instead of an error or the stats grid when section is null', async () => {
    mockApi.get.mockResolvedValue(meResponse({ section: null, entries: [], present: 0, absent: 0, leave: 0, percentage: null }))
    renderPage()

    expect(await screen.findByText('You are not assigned to a class yet.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Attendance')).not.toBeInTheDocument()
    expect(screen.queryByText('Present')).not.toBeInTheDocument()
    expect(screen.queryByText('Absent')).not.toBeInTheDocument()
    expect(screen.queryByText('Leave')).not.toBeInTheDocument()
  })

  it('UC-12-E1 after the admin assigns a section, a later visit (fresh mount) resolves normally with no stale error state', async () => {
    mockApi.get
      .mockResolvedValueOnce(
        meResponse({ section: null, entries: [], present: 0, absent: 0, leave: 0, percentage: null }),
      )
      .mockResolvedValueOnce(
        meResponse({
          section: { id: 's5a', name: 'A' },
          entries: [{ date: '2024-05-01', status: 'present' }],
          present: 1,
          absent: 0,
          leave: 0,
          percentage: 100,
        }),
      )

    const first = renderPage()
    await screen.findByText('You are not assigned to a class yet.')
    first.unmount()

    renderPage()

    await screen.findByText(formatDateLabel('2024-05-01'))
    expect(screen.queryByText('You are not assigned to a class yet.')).not.toBeInTheDocument()
    expect(within(statCard('Attendance')).getByText('100%')).toBeInTheDocument()
    expect(mockApi.get).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// Code-review fix: clearing the month input mid-flight must bump the request-id ref so a
// still-in-flight (now-stale) response gets discarded instead of repopulating the view after the
// month input has already been cleared.
// ---------------------------------------------------------------------------
describe('MyAttendancePage stale-request race guard (code-review fix)', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((res) => {
      resolve = res
    })
    return { promise, resolve }
  }

  it('own addition: clearing the month mid-flight discards the stale response and does not show "Invalid Date"', async () => {
    mockApi.get.mockResolvedValue(meResponse())
    renderPage()
    await screen.findByText('Attendance')

    const pending = deferred<MeResponse>()
    const baseGet = mockApi.get.getMockImplementation() as (path: string) => Promise<unknown>
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/attendance/me?month=2024-03') return pending.promise
      return baseGet(path)
    })

    fireEvent.change(monthInput(), { target: { value: '2024-03' } })
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/attendance/me?month=2024-03'))

    // Clear the month before the in-flight request for 2024-03 resolves.
    fireEvent.change(monthInput(), { target: { value: '' } })

    await act(async () => {
      pending.resolve(
        meResponse({
          entries: [{ date: '2024-03-01', status: 'present' }],
          present: 1,
          absent: 0,
          leave: 0,
          percentage: 100,
        }),
      )
    })

    // The stale response must not repopulate the view now that the month input is empty, and the
    // heading must not render "Invalid Date" for the cleared month key.
    expect(screen.queryByText(formatDateLabel('2024-03-01'))).not.toBeInTheDocument()
    expect(screen.queryByText('Attendance')).not.toBeInTheDocument()
    expect(screen.queryByText(/invalid date/i)).not.toBeInTheDocument()
    expect(screen.queryByText('No attendance marked for this month yet.')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Parent branch stays exactly as-is and unwired (ticket's Technical notes) — out of scope per
// docs/brainstorm.md. This is a regression guard, not a numbered T-039 acceptance criterion.
// ---------------------------------------------------------------------------
describe('MyAttendancePage parent branch (unchanged, unwired per T-039 Technical notes)', () => {
  it('own addition: a parent account still renders the unwired mock data and never calls GET /attendance/me', async () => {
    renderPage(parentUser)

    const student = defaultStudent()
    expect(screen.getByText(new RegExp(`Attendance record for ${student.name}`))).toBeInTheDocument()

    // Give any (incorrectly) fired request a tick to resolve/reject before asserting it never happened.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockApi.get).not.toHaveBeenCalled()
  })
})
