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
  const { container } = render(<AdminCreatePage {...props} />)
  return { ...props, container }
}

/** Submits the single <form> rendered for the currently active tab. */
function submitActiveForm(container: HTMLElement) {
  const form = container.querySelector('form')
  if (!form) throw new Error('Expected a form to be rendered for the active tab')
  fireEvent.submit(form)
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

// Tests for T-006: migrate AdminCreatePage's duplicated `EMAIL_PATTERN` regex
// and local TextField/SelectField/TextAreaField helpers to the shared
// `isValidEmail` validator and `Input`/`Select` components from T-005.
//
// AdminCreatePage still has its own EMAIL_PATTERN and field helpers today, so
// these tests exercise the pre-migration component directly. They assert on
// user-visible behavior (error text, success text) only, so they must keep
// passing unchanged once the migration happens underneath.
describe('AdminCreatePage — T-006 email/name validation regression (pre-migration)', () => {
  it('AC-02.1 teacher tab: invalid email "bob@" shows "Please enter a valid email address." on submit', () => {
    const { container } = renderPage({ initialTab: 'teacher' })

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Taylor Teacher' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'bob@' } })
    submitActiveForm(container)

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address.')
  })

  it('AC-02.2 parent tab: invalid email shows "Please enter a valid email address." on submit', () => {
    const { container } = renderPage({ initialTab: 'parent' })

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Pat Parent' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'not-an-email' } })
    submitActiveForm(container)

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address.')
  })

  it('AC-02.4 teacher tab: a syntactically valid email shows no email-format error on submit', () => {
    const { container } = renderPage({ initialTab: 'teacher' })

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Taylor Teacher' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'taylor@example.com' } })
    submitActiveForm(container)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('AC-02.4 parent tab: a syntactically valid email shows no email-format error on submit', () => {
    const { container } = renderPage({ initialTab: 'parent' })

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Pat Parent' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'pat@example.com' } })
    submitActiveForm(container)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('success-path (unchanged): teacher tab with valid name+email shows "Teacher account created for Taylor Teacher." exactly', () => {
    const { container } = renderPage({ initialTab: 'teacher' })

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Taylor Teacher' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'taylor@example.com' } })
    submitActiveForm(container)

    expect(screen.getByText('Teacher account created for Taylor Teacher.')).toBeInTheDocument()
  })

  it('success-path (unchanged): parent tab with valid name+email shows "Parent account created for Pat Parent." exactly', () => {
    const { container } = renderPage({ initialTab: 'parent' })

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Pat Parent' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'pat@example.com' } })
    submitActiveForm(container)

    expect(screen.getByText('Parent account created for Pat Parent.')).toBeInTheDocument()
  })

  it('UC-02-E4 teacher tab: empty full name shows the full-name error and the email validator isn\'t reached', () => {
    const { container } = renderPage({ initialTab: 'teacher' })

    // Leave full name empty; email is also invalid, but the name check must
    // run first and short-circuit before the email validator is ever reached.
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'bob@' } })
    submitActiveForm(container)

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter the teacher’s full name.')
  })

  it('UC-02-E4 parent tab: empty full name shows the full-name error and the email validator isn\'t reached', () => {
    const { container } = renderPage({ initialTab: 'parent' })

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'not-an-email' } })
    submitActiveForm(container)

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter the parent’s full name.')
  })

  it('UC-02-E4 teacher tab: whitespace-only full name is treated as empty (name check runs before email check)', () => {
    const { container } = renderPage({ initialTab: 'teacher' })

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: '   ' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'taylor@example.com' } })
    submitActiveForm(container)

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter the teacher’s full name.')
  })

  it('own addition: student tab preserves name-check-before-grade-check order (same pattern as teacher/parent, no email field on this tab)', () => {
    const { container } = renderPage({ initialTab: 'student' })

    // Student tab has no email field/validator at all — this just confirms
    // the shared "name check runs first" order survives the migration here too.
    fireEvent.change(screen.getByLabelText(/class \/ grade/i), { target: { value: 'Grade 1' } })
    submitActiveForm(container)

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter the student’s full name.')
  })
})
