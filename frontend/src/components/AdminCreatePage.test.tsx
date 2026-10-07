import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { AdminCreatePage } from './AdminCreatePage'
import type { AuthUser } from '../lib/auth'

// Tests for T-003: migrate AdminCreatePage's own header/main markup to the
// shared DashboardShell (T-002), with no visible or behavioral change.
//
// AdminCreatePage still renders its own duplicated header today, so these
// tests exercise the pre-migration component directly. They must keep
// passing unchanged once the migration replaces the header/main markup below
// with <DashboardShell>.

const user: AuthUser = { id: 'admin-1', name: 'Avery Admin', email: 'avery@example.com', role: 'admin' }

function renderPage(overrides: Partial<Parameters<typeof AdminCreatePage>[0]> = {}) {
  const props = {
    user,
    initialTab: 'teacher' as const,
    onBack: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  }
  render(<AdminCreatePage {...props} />)
  return props
}

describe('AdminCreatePage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it('own addition: preserves the max-w-4xl content width used before the DashboardShell migration', () => {
    renderPage()
    const heading = screen.getByText(/add people/i)
    // DashboardShell hardcodes max-w-5xl on its <main>, which does NOT match
    // this page's current max-w-4xl — a naive migration would silently
    // widen the two-column tab/form layout.
    expect(heading.closest('.max-w-4xl')).not.toBeNull()
  })

  it('UC-01-E3 discards unsaved form input without a confirmation prompt when "Back to dashboard" is clicked', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const props = renderPage()

    const nameInput = screen.getByLabelText(/full name/i)
    fireEvent.change(nameInput, { target: { value: 'Unsaved Teacher Name' } })
    expect(nameInput).toHaveValue('Unsaved Teacher Name')

    fireEvent.click(screen.getByText(/back to dashboard/i))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })
})
