import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { MyTimetablePage } from './MyTimetablePage'
import type { AuthUser } from '../lib/auth'
import { DAYS, DEFAULT_PERIODS } from '../data/timetable'

// Tests for T-004: migrate MyTimetablePage's own header/main markup to the
// shared DashboardShell (T-002), with no visible or behavioral change.
//
// MyTimetablePage still renders its own duplicated header today, so these
// tests exercise the pre-migration component directly. They must keep
// passing unchanged once the migration replaces the header/main markup
// below with <DashboardShell>.

const user: AuthUser = { id: 'student-1', name: 'Jamie Student', email: 'jamie@example.com', role: 'student' }

function renderPage(overrides: Partial<Parameters<typeof MyTimetablePage>[0]> = {}) {
  const props = {
    user,
    onBack: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  }
  render(<MyTimetablePage {...props} />)
  return props
}

describe('MyTimetablePage', () => {
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

  it('own addition: preserves the max-w-6xl content width used before the DashboardShell migration', () => {
    renderPage()
    const heading = screen.getByRole('heading', { name: /^my timetable$/i })
    expect(heading.closest('.max-w-6xl')).not.toBeNull()
  })
})

// Tests for T-008: extract the duplicated `formatTime` helper and the
// break-row/grid-cell rendering shared between TimetablePage and
// MyTimetablePage into shared helpers/components, with no change in
// displayed data or styling.
//
// These exercise MyTimetablePage's current (pre-extraction) `formatTime`
// function and break-row markup. The default student user resolves to
// `SECTION_OPTIONS[0]` ("grade5-a"), the same section TimetablePage defaults
// to, so assertions below rely on the same seed data as TimetablePage.test.tsx.
describe('MyTimetablePage (T-008 formatTime/break-row regression)', () => {
  function rowIndexForPeriod(periodId: string) {
    return DEFAULT_PERIODS.findIndex((period) => period.id === periodId) + 1 // +1 skips the header row
  }

  function dayCellIndex(dayId: string) {
    return DAYS.findIndex((day) => day.id === dayId) + 1 // +1 skips the leading Time column
  }

  it('AC-04.1 renders a full-width break row with amber styling, coffee icon, and time range, matching TimetablePage', () => {
    renderPage()
    const rows = screen.getAllByRole('row')
    const breakRow = rows[rowIndexForPeriod('break-1')]

    expect(breakRow.className).toContain('bg-amber-50/60')
    const cells = within(breakRow).getAllByRole('cell')
    expect(cells).toHaveLength(1)
    expect(cells[0]).toHaveAttribute('colspan', String(DAYS.length + 1))
    expect(breakRow.textContent).toContain('Recess')
    expect(breakRow.textContent).toContain('10:15 AM')
    expect(breakRow.textContent).toContain('10:30 AM')
    // Shared row logic (AC-04.1) must render the same Coffee icon TimetablePage
    // already shows in its break row. MyTimetablePage doesn't render one today
    // (it doesn't even import the icon), so this assertion is expected to fail
    // until the T-008 extraction adds the shared row component.
    expect(breakRow.querySelector('.lucide-coffee')).not.toBeNull()
  })

  it('AC-04.2 shows the dashed "Free" placeholder for a day with no entry', () => {
    renderPage() // default user is a student -> grade5-a, same section TimetablePage defaults to
    const rows = screen.getAllByRole('row')
    // grade5-a / p4 has no Friday entry in INITIAL_TIMETABLES.
    const row = rows[rowIndexForPeriod('p4')]
    const cells = within(row).getAllByRole('cell')
    const fridayCell = cells[dayCellIndex('fri')]

    const placeholder = within(fridayCell).getByText('Free')
    expect(placeholder).toHaveClass('border-dashed')
  })

  it("AC-04.4 shows the correct section label caption for each of a multi-section teacher's cells", () => {
    // Daniel Ortiz (t2) teaches Mathematics in both grade5-a/p2/tue and
    // grade5-b/p1/tue — distinct period ids avoid the same-slot overwrite
    // that happens when two sections share both period id and day.
    const teacherUser: AuthUser = { id: 't-1', name: 'Daniel Ortiz', email: 'daniel@example.com', role: 'teacher' }
    renderPage({ user: teacherUser })

    const rows = screen.getAllByRole('row')
    const p1Row = rows[rowIndexForPeriod('p1')]
    const p2Row = rows[rowIndexForPeriod('p2')]
    const tueIndex = dayCellIndex('tue')

    const p1TueCell = within(p1Row).getAllByRole('cell')[tueIndex]
    const p2TueCell = within(p2Row).getAllByRole('cell')[tueIndex]

    expect(within(p1TueCell).getByText('Mathematics')).toBeInTheDocument()
    expect(within(p1TueCell).getByText('Grade 5 - B')).toBeInTheDocument()

    expect(within(p2TueCell).getByText('Mathematics')).toBeInTheDocument()
    expect(within(p2TueCell).getByText('Grade 5 - A')).toBeInTheDocument()
  })

  it('UC-04-E2 falls back to TEACHERS[0] when the teacher name matches no seed teacher', () => {
    const unmatchedTeacher: AuthUser = {
      id: 't-x',
      name: 'Nobody Matches',
      email: 'nobody@example.com',
      role: 'teacher',
    }
    renderPage({ user: unmatchedTeacher })

    expect(screen.getByText(/shown for Grace Kim\./)).toBeInTheDocument()
  })
})
