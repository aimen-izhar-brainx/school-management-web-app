import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { MyAttendancePage } from './MyAttendancePage'
import type { AuthUser } from '../lib/auth'
import {
  INITIAL_ATTENDANCE_RECORDS,
  defaultStudent,
  findStudentSection,
  formatDateLabel,
  statusInfo,
  studentMonthEntries,
} from '../data/attendance'

// Tests for T-004: migrate MyAttendancePage's own header/main markup to the
// shared DashboardShell (T-002), with no visible or behavioral change.
//
// MyAttendancePage still renders its own duplicated header today, so these
// tests exercise the pre-migration component directly. They must keep
// passing unchanged once the migration replaces the header/main markup
// below with <DashboardShell>.

const user: AuthUser = { id: 'student-1', name: 'Jamie Student', email: 'jamie@example.com', role: 'student' }

function renderPage(overrides: Partial<Parameters<typeof MyAttendancePage>[0]> = {}) {
  const props = {
    user,
    onBack: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  }
  render(<MyAttendancePage {...props} />)
  return props
}

describe('MyAttendancePage', () => {
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

  it('own addition: preserves the max-w-2xl content width used before the DashboardShell migration', () => {
    renderPage()
    const heading = screen.getByRole('heading', { name: /^my attendance$/i })
    expect(heading.closest('.max-w-2xl')).not.toBeNull()
  })
})

// Tests for T-007: extract status-badge rendering, roster/empty-state list
// rendering, and percentage calculation shared with AttendancePage into
// shared helpers/components, with no change in displayed data or styling.
//
// These exercise the current, pre-extraction markup in MyAttendancePage and
// must keep passing unchanged once the shared helpers/components replace it.
// The test user ("Jamie Student") doesn't match any seed roster name, so
// `useLinkedStudent` falls back to `defaultStudent()`, giving deterministic
// student/section fixtures to drive assertions against.
describe('MyAttendancePage (T-007 badge/roster/percentage regression)', () => {
  it('AC-03.2 shows the same badge style/label as AttendancePage for each recorded entry', () => {
    renderPage()

    const student = defaultStudent()
    const section = findStudentSection(student.id)
    expect(section).not.toBeNull()

    // Pick a month known to have seeded entries for this student, independent of "today".
    const sampleKey = Object.keys(INITIAL_ATTENDANCE_RECORDS).find(
      (key) => key.startsWith(`${section!.id}__`) && INITIAL_ATTENDANCE_RECORDS[key].entries[student.id],
    )
    expect(sampleKey).toBeDefined()
    const monthKey = INITIAL_ATTENDANCE_RECORDS[sampleKey!].date.slice(0, 7)

    const monthInput = screen.getByLabelText(/month/i)
    fireEvent.change(monthInput, { target: { value: monthKey } })

    const entries = studentMonthEntries(INITIAL_ATTENDANCE_RECORDS, section!.id, student.id, monthKey)
    expect(entries.length).toBeGreaterThan(0)

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(entries.length)

    const expectedOrder = [...entries].reverse()
    expectedOrder.forEach((entry, index) => {
      const info = statusInfo(entry.status)
      const row = rows[index]
      expect(within(row).getByText(formatDateLabel(entry.date))).toBeInTheDocument()
      const badge = within(row).getByText(info.label)
      info.badgeClass.split(' ').forEach((cls) => expect(badge).toHaveClass(cls))
    })
  })

  it('AC-03.4 / UC-03-E1 shows the empty-state message and "—" percentage for zero entries in the month', () => {
    renderPage()

    const monthInput = screen.getByLabelText(/month/i)
    fireEvent.change(monthInput, { target: { value: '2099-01' } }) // far outside any seeded data

    expect(screen.getByText('No attendance marked for this month yet.')).toBeInTheDocument()
    expect(screen.queryByText(/nan/i)).not.toBeInTheDocument()

    const attendanceLabel = screen.getByText('Attendance')
    const card = attendanceLabel.closest('div')
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText('—')).toBeInTheDocument()

    expect(within(card as HTMLElement).queryByText(/%$/)).not.toBeInTheDocument()
  })
})
