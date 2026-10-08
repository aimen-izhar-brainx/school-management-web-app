import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { AttendancePage } from './AttendancePage'
import type { AuthUser } from '../lib/auth'

// Test for T-007 / UC-03-E2: AttendancePage must render a large roster
// (50+ students) without errors.
//
// The seed rosters in `data/attendance.ts` top out at 5 students per section,
// so this test stubs `rosterFor` and `INITIAL_ATTENDANCE_RECORDS` for a
// single section with a 62-student roster, leaving every other export (and
// every other section's real seed data) untouched via `importOriginal`.
vi.mock('../data/attendance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/attendance')>()

  const bigSectionId = 'grade5-a'
  const bigDate = actual.mostRecentSchoolDay()
  const bigRoster = Array.from({ length: 62 }, (_, index) => ({
    id: `big-${index}`,
    name: `Student ${index}`,
    rollNumber: String(1000 + index),
  }))
  const bigEntries: Record<string, 'present' | 'absent' | 'leave'> = {}
  for (const [index, student] of bigRoster.entries()) {
    bigEntries[student.id] = index % 7 === 0 ? 'leave' : index % 3 === 0 ? 'absent' : 'present'
  }
  const bigKey = actual.attendanceKey(bigSectionId, bigDate)

  return {
    ...actual,
    rosterFor: (sectionId: string) => (sectionId === bigSectionId ? bigRoster : actual.rosterFor(sectionId)),
    INITIAL_ATTENDANCE_RECORDS: {
      ...actual.INITIAL_ATTENDANCE_RECORDS,
      [bigKey]: {
        sectionId: bigSectionId,
        date: bigDate,
        entries: bigEntries,
        submittedBy: 'Class teacher',
        submittedAt: new Date(`${bigDate}T08:45:00`).toISOString(),
        locked: true,
        editLog: [],
      },
    },
  }
})

const user: AuthUser = { id: 'admin-1', name: 'Avery Admin', email: 'avery@example.com', role: 'admin' }

describe('AttendancePage (T-007 large roster regression)', () => {
  it('UC-03-E2 renders a 50+ student roster without throwing', () => {
    expect(() => render(<AttendancePage user={user} onBack={vi.fn()} onSignOut={vi.fn()} />)).not.toThrow()

    expect(screen.getByText('Student 0')).toBeInTheDocument()
    expect(screen.getByText('Student 61')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(62)
  })
})
