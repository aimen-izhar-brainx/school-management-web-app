import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { ProfilePage } from './ProfilePage'
import type { AuthUser } from '../lib/auth'

// Tests for T-003: migrate ProfilePage's own header/main markup to the
// shared DashboardShell (T-002), with no visible or behavioral change.
//
// ProfilePage still renders its own duplicated header today, so these tests
// exercise the pre-migration component directly. They must keep passing
// unchanged once the migration replaces the header/main markup below with
// <DashboardShell>.
//
// Note: ProfilePage's own content has a tab button labeled exactly
// "Profile" (next to "Change password"), distinct from a header Profile
// button. All header-button assertions below are scoped with `within(header)`
// so they can't be satisfied by that in-page tab button instead.

const user: AuthUser = { id: 'student-1', name: 'Jamie Student', email: 'jamie@example.com', role: 'student' }

function renderPage(overrides: Partial<Parameters<typeof ProfilePage>[0]> = {}) {
  const props = {
    user,
    onBack: vi.fn(),
    onSignOut: vi.fn(),
    onProfileUpdated: vi.fn(),
    ...overrides,
  }
  const { container } = render(<ProfilePage {...props} />)
  return { ...props, container }
}

/** Submits the single <form> rendered for the currently active (profile) tab. */
function submitProfileForm(container: HTMLElement) {
  const form = container.querySelector('form')
  if (!form) throw new Error('Expected the profile-tab form to be rendered')
  fireEvent.submit(form)
}

describe('ProfilePage', () => {
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
    const heading = screen.getByText(/your profile/i)
    // DashboardShell hardcodes max-w-5xl on its <main>, which does NOT match
    // this page's current max-w-4xl — a naive migration would silently
    // widen this page's content/form columns.
    expect(heading.closest('.max-w-4xl')).not.toBeNull()
  })
})

// Tests for T-006: migrate ProfilePage's inline email regex (in
// `handleSaveInfo`) to the shared `isValidEmail` validator from T-005.
//
// ProfilePage still has its own inline regex today, so these tests exercise
// the pre-migration component directly. They assert on user-visible behavior
// (error text, success text) only, so they must keep passing unchanged once
// the migration routes through the shared validator.
describe('ProfilePage — T-006 email validation regression (pre-migration)', () => {
  it('AC-02.3 profile tab: invalid email shows "Please enter a valid email address." on submit', () => {
    const { container } = renderPage()

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'bob@' } })
    submitProfileForm(container)

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address.')
  })

  it('AC-02.4 profile tab: a syntactically valid email shows no email-format error on submit', () => {
    const { container } = renderPage()

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'jamie.new@example.com' } })
    submitProfileForm(container)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('success-path (unchanged): valid name+email shows "Your profile has been updated." exactly', () => {
    const { container } = renderPage()

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Jamie Updated' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'jamie.updated@example.com' } })
    submitProfileForm(container)

    expect(screen.getByText('Your profile has been updated.')).toBeInTheDocument()
  })

  it('own addition: profile tab preserves name-check-before-email-check order (matches AdminCreatePage tabs, per ticket technical notes)', () => {
    const { container } = renderPage()

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: '   ' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'not-an-email' } })
    submitProfileForm(container)

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your name.')
  })
})
