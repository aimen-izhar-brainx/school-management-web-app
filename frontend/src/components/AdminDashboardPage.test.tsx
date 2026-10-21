import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { AdminDashboardPage } from './AdminDashboardPage'
import type { AuthUser } from '../lib/auth'

// Tests for T-003: migrate AdminDashboardPage's own header/main markup to the
// shared DashboardShell (T-002), with no visible or behavioral change.
//
// AdminDashboardPage still renders its own duplicated header today, so these
// tests exercise the pre-migration component directly. They must keep
// passing unchanged once the migration replaces the header/main markup below
// with <DashboardShell>.

const user: AuthUser = { id: 'admin-1', name: 'Avery Admin', email: 'avery@example.com', role: 'admin' }

function renderPage(overrides: Partial<Parameters<typeof AdminDashboardPage>[0]> = {}) {
  const props = {
    user,
    onOpenProfile: vi.fn(),
    onOpenPeople: vi.fn(),
    onOpenClasses: vi.fn(),
    onOpenTimetable: vi.fn(),
    onOpenAttendance: vi.fn(),
    onOpenNotices: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  }
  render(<AdminDashboardPage {...props} />)
  return props
}

describe('AdminDashboardPage', () => {
  it('AC-01.1 header shows the GraduationCap icon and "Brainx School" text', () => {
    renderPage()
    const header = screen.getByRole('banner')

    expect(within(header).getByText('Brainx School')).toBeInTheDocument()
    expect(document.querySelectorAll('.lucide-graduation-cap').length).toBeGreaterThan(0)
  })

  it('AC-01.3 header shows both a Profile and a Sign out button, wired to their callbacks', () => {
    const props = renderPage()
    const header = screen.getByRole('banner')

    const profileButton = within(header).getByRole('button', { name: /^profile$/i })
    const signOutButton = within(header).getByRole('button', { name: /sign out/i })

    fireEvent.click(profileButton)
    expect(props.onOpenProfile).toHaveBeenCalledTimes(1)

    fireEvent.click(signOutButton)
    expect(props.onSignOut).toHaveBeenCalledTimes(1)
  })

  it('own addition: preserves the max-w-5xl content width used before the DashboardShell migration', () => {
    renderPage()
    const heading = screen.getByText(/welcome, avery admin/i)
    // DashboardShell hardcodes max-w-5xl on its <main>, which happens to
    // match this page already — asserted explicitly so a future change to
    // DashboardShell's width (or a wrapper that loses it) is caught here too.
    expect(heading.closest('.max-w-5xl')).not.toBeNull()
  })
})
