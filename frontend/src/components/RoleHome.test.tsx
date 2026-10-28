import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { RoleHome } from './RoleHome'
import type { AuthUser } from '../lib/auth'

// Tests for T-003: migrate RoleHome's own header/main markup to the shared
// DashboardShell (T-002), with no visible or behavioral change.
//
// RoleHome still renders its own duplicated header today, so these tests
// exercise the pre-migration component directly. They must keep passing
// unchanged once the migration replaces the header/main markup below with
// <DashboardShell>.

const user: AuthUser = { id: 'teacher-1', name: 'Taylor Teacher', email: 'taylor@example.com', role: 'teacher' }

function renderPage(overrides: Partial<Parameters<typeof RoleHome>[0]> = {}) {
  const props = {
    user,
    onOpenProfile: vi.fn(),
    onOpenMyTimetable: vi.fn(),
    onOpenMarkAttendance: vi.fn(),
    onOpenMyAttendance: vi.fn(),
    onOpenNotices: vi.fn(),
    onOpenExams: vi.fn(),
    onOpenMyResults: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  }
  render(<RoleHome {...props} />)
  return props
}

describe('RoleHome', () => {
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

  it('own addition: preserves the max-w-3xl content width used before the DashboardShell migration', () => {
    renderPage()
    const heading = screen.getByText(/welcome, taylor teacher/i)
    // DashboardShell hardcodes max-w-5xl on its <main>, which does NOT match
    // this page's current max-w-3xl — a naive migration would silently widen
    // this page's content. This must keep passing after the migration,
    // which means DashboardShell needs a width-override capability (or this
    // page needs its own inner wrapper) rather than relying on the shell's
    // own <main> width.
    expect(heading.closest('.max-w-3xl')).not.toBeNull()
  })
})
