import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { MyTimetablePage } from './MyTimetablePage'
import type { AuthUser } from '../lib/auth'

// Test for T-008 / AC-04.3 edge cases: the shared `formatTime` helper must
// format midnight and noon the same way it formats an ordinary afternoon
// time, identically on both pages. TimetablePage exercises these edge cases
// via its live add-period form (see TimetablePage.test.tsx); MyTimetablePage
// has no such form, so this stubs `DEFAULT_PERIODS` with synthetic periods at
// those edge times, leaving every other export (and the real seed data)
// untouched via `importOriginal`.
//
// The replacement array is declared via `vi.hoisted` because `vi.mock`
// factories are hoisted above top-level `const` declarations.
const { edgePeriods } = vi.hoisted(() => ({
  edgePeriods: [
    { id: 'edge-midnight', startTime: '00:00', endTime: '00:15' },
    { id: 'edge-noon', startTime: '12:00', endTime: '12:15' },
    { id: 'edge-pm', startTime: '14:30', endTime: '14:45' },
  ],
}))

vi.mock('../data/timetable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/timetable')>()
  return { ...actual, DEFAULT_PERIODS: edgePeriods }
})

const user: AuthUser = { id: 'student-1', name: 'Jamie Student', email: 'jamie@example.com', role: 'student' }

describe('MyTimetablePage (T-008 formatTime edge cases)', () => {
  it('AC-04.3 formats midnight ("00:00" -> "12:00 AM") and noon ("12:00" -> "12:00 PM"), same as a PM time', () => {
    render(<MyTimetablePage user={user} onBack={vi.fn()} onSignOut={vi.fn()} />)

    const rows = screen.getAllByRole('row')
    // Row 0 is the header; rows 1-3 correspond to edgePeriods in order.
    const [midnightRow, noonRow, pmRow] = [rows[1], rows[2], rows[3]]

    expect(within(midnightRow).getAllByRole('cell')[0].textContent).toBe('12:00 AM12:15 AM')
    expect(within(noonRow).getAllByRole('cell')[0].textContent).toBe('12:00 PM12:15 PM')
    expect(within(pmRow).getAllByRole('cell')[0].textContent).toBe('2:30 PM2:45 PM')
  })
})
