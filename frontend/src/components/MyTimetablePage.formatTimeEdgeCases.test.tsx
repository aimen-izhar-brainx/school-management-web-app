import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { MyTimetablePage } from './MyTimetablePage'
import type { AuthUser } from '../lib/auth'
import { api } from '../lib/http'

// T-008 / AC-04.3 edge cases, re-expressed for the real-API page (T-025): the shared `formatTime` helper
// (still in data/timetable, used by TimetableGrid) must format midnight and noon like any other time.
// Instead of stubbing mock-data periods, the periods now come from the mocked GET /timetable/me response.
vi.mock('../lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/http')>()
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> }
const user: AuthUser = { id: 'student-1', name: 'Jamie Student', email: 'jamie@example.com', role: 'student' }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('MyTimetablePage (T-008 formatTime edge cases)', () => {
  it('AC-04.3 formats midnight ("00:00" -> "12:00 AM") and noon ("12:00" -> "12:00 PM"), same as a PM time', async () => {
    mockApi.get.mockResolvedValue({
      kind: 'student',
      section: { id: 's5a', name: 'A', className: 'Grade 5' },
      periods: [
        { id: 'edge-midnight', order: 1, label: 'Night', startTime: '00:00', endTime: '00:15', isBreak: false },
        { id: 'edge-noon', order: 2, label: 'Noon', startTime: '12:00', endTime: '12:15', isBreak: false },
        { id: 'edge-pm', order: 3, label: 'Afternoon', startTime: '14:30', endTime: '14:45', isBreak: false },
      ],
      entries: [],
    })
    render(<MyTimetablePage user={user} onBack={vi.fn()} onSignOut={vi.fn()} />)
    await screen.findByRole('table')

    const rows = screen.getAllByRole('row')
    const [midnightRow, noonRow, pmRow] = [rows[1], rows[2], rows[3]]

    expect(midnightRow.textContent).toContain('12:00 AM12:15 AM')
    expect(noonRow.textContent).toContain('12:00 PM12:15 PM')
    expect(pmRow.textContent).toContain('2:30 PM2:45 PM')
    expect(within(midnightRow).getAllByRole('cell')).toHaveLength(5)
  })
})
