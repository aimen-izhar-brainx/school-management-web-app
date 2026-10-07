import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { DashboardShell } from './DashboardShell'

// Tests for T-002: shared DashboardShell/PageHeader component.
//
// `DashboardShell` does not exist yet, so this whole file is expected to fail
// to resolve the `./DashboardShell` import until the component is built.
describe('DashboardShell', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('AC-01.1 renders the GraduationCap icon and "Brainx School" text', () => {
    const { container } = render(
      <DashboardShell onSignOut={vi.fn()}>
        <p>page content</p>
      </DashboardShell>,
    )

    // "Brainx School" may legitimately appear more than once (e.g. a
    // responsive mobile/desktop pair), as it does in AuthShell — assert at
    // least one match rather than assuming exactly one.
    const brandMatches = screen.getAllByText('Brainx School')
    expect(brandMatches.length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.lucide-graduation-cap').length).toBeGreaterThan(0)
  })

  it('AC-01.2 sign-out-only variant renders only a Sign out button (no Profile button), and clicking it calls onSignOut', () => {
    const onSignOut = vi.fn()
    render(
      <DashboardShell onSignOut={onSignOut}>
        <p>page content</p>
      </DashboardShell>,
    )

    const signOutButton = screen.getByRole('button', { name: /sign out/i })
    expect(signOutButton).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^profile$/i })).not.toBeInTheDocument()

    fireEvent.click(signOutButton)
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('AC-01.3 profile+sign-out variant renders both Profile and Sign out buttons (no back link), and clicking Profile calls onOpenProfile', () => {
    const onSignOut = vi.fn()
    const onOpenProfile = vi.fn()
    render(
      <DashboardShell onSignOut={onSignOut} onOpenProfile={onOpenProfile}>
        <p>page content</p>
      </DashboardShell>,
    )

    const profileButton = screen.getByRole('button', { name: /^profile$/i })
    const signOutButton = screen.getByRole('button', { name: /sign out/i })
    expect(profileButton).toBeInTheDocument()
    expect(signOutButton).toBeInTheDocument()
    expect(screen.queryByText(/back to dashboard/i)).not.toBeInTheDocument()

    fireEvent.click(profileButton)
    expect(onOpenProfile).toHaveBeenCalledTimes(1)

    fireEvent.click(signOutButton)
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('AC-01.5 renders a "Back to dashboard" link with a left-arrow icon when onBack is passed, above the page content, and clicking it calls onBack', () => {
    const onBack = vi.fn()
    const { container } = render(
      <DashboardShell onSignOut={vi.fn()} onBack={onBack}>
        <h1>Page title</h1>
      </DashboardShell>,
    )

    const backLink = screen.getByText(/back to dashboard/i)
    expect(backLink).toBeInTheDocument()
    expect(container.querySelectorAll('.lucide-arrow-left').length).toBeGreaterThan(0)

    // "Above the page title/content": the back link's position in the
    // rendered DOM order should precede the page title.
    const title = screen.getByText('Page title')
    expect(
      backLink.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    fireEvent.click(backLink)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('AC-01.5 edge: does not render a "Back to dashboard" link when onBack is not passed', () => {
    render(
      <DashboardShell onSignOut={vi.fn()}>
        <p>page content</p>
      </DashboardShell>,
    )

    expect(screen.queryByText(/back to dashboard/i)).not.toBeInTheDocument()
  })

  it('UC-01-E1 header keeps the logo/title and action buttons as distinct elements within one header landmark, and renders without console errors or warnings', () => {
    // jsdom doesn't lay out or measure elements, so we can't assert actual
    // pixel overlap/clipping at a <360px viewport. The meaningful proxy we
    // can check here is that the logo/title and the action buttons are
    // present as separate, non-overlapping DOM nodes inside the header, and
    // that nothing errors/warns while rendering. Real narrow-viewport
    // overlap/clipping should be verified manually (e.g. browser dev tools
    // responsive mode) once the component is built.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <DashboardShell onSignOut={vi.fn()} onOpenProfile={vi.fn()} onBack={vi.fn()}>
        <p>page content</p>
      </DashboardShell>,
    )

    const header = screen.getByRole('banner')
    expect(within(header).getAllByText('Brainx School').length).toBeGreaterThan(0)
    expect(within(header).getByRole('button', { name: /^profile$/i })).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: /sign out/i })).toBeInTheDocument()

    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('UC-01-E1 header action row allows wrapping so buttons move to a second line instead of clipping at narrow viewports', () => {
    // jsdom can't measure real pixel clipping, so this only asserts the
    // structural fix (flex-wrap on the header, matching the flex-wrap
    // convention already used elsewhere in this codebase, e.g.
    // AttendancePage/ClassesPage/MarkAttendancePage) is in place — real
    // confidence that nothing clips down to 320px should come from manual
    // verification (e.g. browser dev tools responsive mode).
    render(
      <DashboardShell onSignOut={vi.fn()} onOpenProfile={vi.fn()}>
        <p>page content</p>
      </DashboardShell>,
    )

    const header = screen.getByRole('banner')
    expect(header.className).toMatch(/\bflex-wrap\b/)
  })
})
