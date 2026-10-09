import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { TimetablePage } from './TimetablePage'
import type { AuthUser } from '../lib/auth'
import { DAYS, DEFAULT_PERIODS } from '../data/timetable'

// Tests for T-004: migrate TimetablePage's own header/main markup to the
// shared DashboardShell (T-002), with no visible or behavioral change.
//
// TimetablePage still renders its own duplicated header today, so these
// tests exercise the pre-migration component directly. They must keep
// passing unchanged once the migration replaces the header/main markup
// below with <DashboardShell>.

const user: AuthUser = { id: 'admin-1', name: 'Avery Admin', email: 'avery@example.com', role: 'admin' }

function renderPage(overrides: Partial<Parameters<typeof TimetablePage>[0]> = {}) {
  const props = {
    user,
    onBack: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  }
  render(<TimetablePage {...props} />)
  return props
}

describe('TimetablePage', () => {
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
    const heading = screen.getByRole('heading', { name: /^timetable$/i })
    // DashboardShell hardcodes max-w-5xl on its <main>, which does NOT match
    // this page's current max-w-6xl — a naive migration would silently
    // narrow this page's wide grid layout.
    expect(heading.closest('.max-w-6xl')).not.toBeNull()
  })
})

// Tests for T-008: extract the duplicated `formatTime` helper and the
// break-row/grid-cell rendering shared between TimetablePage and
// MyTimetablePage into shared helpers/components, with no change in
// displayed data or styling.
//
// These exercise TimetablePage's current (pre-extraction) `formatTime`
// function and break-row markup and must keep passing unchanged once the
// shared helpers/components replace them. The default selected section is
// `SECTION_OPTIONS[0]` ("grade5-a"), the same section MyTimetablePage's
// default student view uses, so the two suites can assert on the same
// underlying seed data.
describe('TimetablePage (T-008 formatTime/break-row regression)', () => {
  function rowIndexForPeriod(periodId: string) {
    return DEFAULT_PERIODS.findIndex((period) => period.id === periodId) + 1 // +1 skips the header row
  }

  function dayCellIndex(dayId: string) {
    return DAYS.findIndex((day) => day.id === dayId) + 1 // +1 skips the leading Time column
  }

  it('AC-04.1 renders a full-width break row with amber styling, coffee icon, and time range', () => {
    renderPage()
    const rows = screen.getAllByRole('row')
    const breakRow = rows[rowIndexForPeriod('break-1')]

    expect(breakRow.className).toContain('bg-amber-50/60')
    const cells = within(breakRow).getAllByRole('cell')
    expect(cells).toHaveLength(1)
    expect(cells[0]).toHaveAttribute('colspan', String(DAYS.length + 1))
    expect(breakRow.querySelector('.lucide-coffee')).not.toBeNull()
    expect(breakRow.textContent).toContain('Recess')
    expect(breakRow.textContent).toContain('10:15 AM')
    expect(breakRow.textContent).toContain('10:30 AM')
  })

  it('AC-04.2 shows "Free period" in the subject dropdown for a day with no entry', () => {
    renderPage()
    const rows = screen.getAllByRole('row')
    // grade5-a / p4 has no Friday entry in INITIAL_TIMETABLES.
    const row = rows[rowIndexForPeriod('p4')]
    const cells = within(row).getAllByRole('cell')
    const fridayCell = cells[dayCellIndex('fri')]

    const subjectSelect = within(fridayCell).getAllByRole('combobox')[0] as HTMLSelectElement
    expect(subjectSelect.value).toBe('')
    expect(subjectSelect.selectedOptions[0]?.textContent).toBe('Free period')
  })

  it('AC-04.3 formats a period\'s time ("14:30") as "2:30 PM" via the add-period form', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '14:30' } })
    fireEvent.change(screen.getByLabelText(/end time/i), { target: { value: '14:45' } })
    fireEvent.click(screen.getByRole('button', { name: /add period/i }))

    const items = screen.getAllByRole('listitem')
    const added = items.find((item) => /2:30 PM.*2:45 PM/.test(item.textContent ?? ''))
    expect(added).toBeDefined()
  })

  it('AC-04.3 edge case: formats noon ("12:00") as "12:00 PM"', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '12:00' } })
    fireEvent.change(screen.getByLabelText(/end time/i), { target: { value: '12:15' } })
    fireEvent.click(screen.getByRole('button', { name: /add period/i }))

    const items = screen.getAllByRole('listitem')
    const added = items.find((item) => /12:00 PM.*12:15 PM/.test(item.textContent ?? ''))
    expect(added).toBeDefined()
  })

  it('AC-04.3 edge case: formats midnight ("00:00") as "12:00 AM"', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '00:00' } })
    fireEvent.change(screen.getByLabelText(/end time/i), { target: { value: '00:15' } })
    fireEvent.click(screen.getByRole('button', { name: /add period/i }))

    const items = screen.getAllByRole('listitem')
    const added = items.find((item) => /12:00 AM.*12:15 AM/.test(item.textContent ?? ''))
    expect(added).toBeDefined()
  })

  it('UC-04-E3 shows "No periods defined yet." once every period is removed', () => {
    renderPage()
    let removeButtons = screen.queryAllByRole('button', { name: /remove period/i })
    while (removeButtons.length > 0) {
      fireEvent.click(removeButtons[0])
      removeButtons = screen.queryAllByRole('button', { name: /remove period/i })
    }
    expect(screen.getByText('No periods defined yet.')).toBeInTheDocument()
  })
})
