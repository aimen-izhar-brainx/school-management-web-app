import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { AttendancePage } from './AttendancePage'
import type { AuthUser } from '../lib/auth'
import {
  ATTENDANCE_STATUSES,
  INITIAL_ATTENDANCE_RECORDS,
  attendanceKey,
  formatDateLabel,
  mostRecentSchoolDay,
  rosterFor,
  statusInfo,
  summarizeEntries,
} from '../data/attendance'
import { SECTION_OPTIONS, sectionLabel } from '../data/timetable'

// Tests for T-004: migrate AttendancePage's own header/main markup to the
// shared DashboardShell (T-002), with no visible or behavioral change.
//
// AttendancePage still renders its own duplicated header today, so these
// tests exercise the pre-migration component directly. They must keep
// passing unchanged once the migration replaces the header/main markup
// below with <DashboardShell>.

const user: AuthUser = { id: 'admin-1', name: 'Avery Admin', email: 'avery@example.com', role: 'admin' }

function renderPage(overrides: Partial<Parameters<typeof AttendancePage>[0]> = {}) {
  const props = {
    user,
    onBack: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  }
  render(<AttendancePage {...props} />)
  return props
}

describe('AttendancePage', () => {
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

  it('own addition: preserves the max-w-5xl content width used before the DashboardShell migration', () => {
    renderPage()
    const heading = screen.getByRole('heading', { name: /^attendance$/i })
    expect(heading.closest('.max-w-5xl')).not.toBeNull()
  })
})

// Tests for T-007: extract status-badge rendering, roster/empty-state list
// rendering, and the edit-mode-reset-on-filter-change logic shared with
// MyAttendancePage into shared helpers/components, with no change in
// displayed data or styling.
//
// These exercise the current, pre-extraction markup in AttendancePage and
// must keep passing unchanged once the shared helpers/components replace it.
describe('AttendancePage (T-007 badge/roster/edit-mode regression)', () => {
  const defaultSectionId = SECTION_OPTIONS[0]?.id ?? ''
  const defaultDate = mostRecentSchoolDay()

  it('AC-03.1 shows per-status badge styling (color classes + dot indicator) for a recorded day', () => {
    renderPage()

    const record = INITIAL_ATTENDANCE_RECORDS[attendanceKey(defaultSectionId, defaultDate)]
    expect(record).toBeTruthy() // sanity: seed data marks the default browse day

    const counts = summarizeEntries(record.entries)
    const summaryBadges = document.querySelectorAll('span.inline-flex')
    expect(summaryBadges).toHaveLength(ATTENDANCE_STATUSES.length)

    ATTENDANCE_STATUSES.forEach((status, index) => {
      const badge = summaryBadges[index]
      status.badgeClass.split(' ').forEach((cls) => expect(badge).toHaveClass(cls))
      expect(badge.textContent).toBe(String(counts[status.id]))

      const dot = badge.querySelector('span')
      expect(dot).not.toBeNull()
      status.dotClass.split(' ').forEach((cls) => expect(dot as Element).toHaveClass(cls))
    })

    // Per-student roster badges carry the same badgeClass/label as the summary above.
    const roster = rosterFor(defaultSectionId)
    const rosterItems = screen.getAllByRole('listitem').slice(0, roster.length)
    roster.forEach((student, index) => {
      const status = record.entries[student.id]
      const info = statusInfo(status)
      const badge = within(rosterItems[index]).getByText(info.label)
      info.badgeClass.split(' ').forEach((cls) => expect(badge).toHaveClass(cls))
    })
  })

  it('AC-03.3 shows "Not marked yet for {section} on {date}." for a section/date with no record', () => {
    renderPage()

    const unmarkedDate = '2031-06-02' // far outside the seeded recent-school-days window
    const dateInput = document.getElementById('browse-date') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: unmarkedDate } })

    const expectedText = `Not marked yet for ${sectionLabel(SECTION_OPTIONS[0])} on ${formatDateLabel(unmarkedDate)}.`
    const emptyState = screen.getByText(/Not marked yet for/)
    expect(emptyState.textContent).toBe(expectedText)
  })

  it('UC-03-E1 shows "—" (never NaN) for every student when zero days are marked in the month', () => {
    renderPage()

    const monthInput = document.getElementById('monthly-month') as HTMLInputElement
    fireEvent.change(monthInput, { target: { value: '2099-01' } })

    const roster = rosterFor(defaultSectionId)
    expect(roster.length).toBeGreaterThan(0)

    const dashes = screen.getAllByText('—')
    expect(dashes).toHaveLength(roster.length)
    expect(screen.queryByText(/nan/i)).not.toBeInTheDocument()
  })

  it('UC-03-E3 cancels edit mode automatically when the admin changes the section mid-edit', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /edit this day/i }))
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()

    const sectionSelect = document.getElementById('browse-section') as HTMLSelectElement
    fireEvent.change(sectionSelect, { target: { value: SECTION_OPTIONS[1].id } })

    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument()
    // The new section/date pair still has seed data, so edit mode's exit is observable
    // via "Edit this day" reappearing rather than falling into the empty state.
    expect(screen.getByRole('button', { name: /edit this day/i })).toBeInTheDocument()
  })

  it('UC-03-E3 cancels edit mode automatically when the admin changes the date mid-edit', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /edit this day/i }))
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()

    const unmarkedDate = '2031-06-02'
    const dateInput = document.getElementById('browse-date') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: unmarkedDate } })

    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Not marked yet for/)).toBeInTheDocument()
  })
})
