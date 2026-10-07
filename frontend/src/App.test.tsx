import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import App from './App'
import type { AuthSession, AuthUser } from './lib/auth'

// Tests for T-003: migrating AdminDashboardPage/RoleHome/ProfilePage/
// AdminCreatePage/ClassesPage to the shared DashboardShell must not change
// App.tsx's sign-out / back-navigation wiring.
//
// These run through the real App -> lib/auth -> lib/http stack (only the
// global `fetch` is mocked), so they exercise the actual session-clearing
// and error-swallowing logic AC-01.4/UC-01-E2 depend on — not just a page's
// own onSignOut/onBack prop being called. AC-01.4/UC-01-E2 are existing
// App.tsx behavior, unrelated to the header markup each page owns, so they
// should already pass against the current (unmigrated) pages; the migration
// must not break them.

function fakeSession(role: AuthUser['role'], name: string): AuthSession {
  return {
    token: 'fake-access-token',
    user: { id: `${role}-1`, name, email: `${role}@example.com`, role },
  }
}

interface StubFetchOptions {
  session: AuthSession
  logoutShouldFail?: boolean
}

/** Stubs the only two backend calls App.tsx makes on load (/auth/refresh) and sign-out (/auth/logout). */
function stubFetch({ session, logoutShouldFail = true }: StubFetchOptions) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)

    if (url.includes('/auth/refresh')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => session })
    }

    if (url.includes('/auth/logout')) {
      return logoutShouldFail
        ? Promise.reject(new Error('simulated network failure'))
        : Promise.resolve({ ok: true, status: 204, json: async () => null })
    }

    return Promise.reject(new Error(`unexpected fetch to ${url}`))
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('App (sign-out & back-navigation integration)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('AC-01.4 clicking Sign out clears the session and shows the login screen, even when /auth/logout fails', async () => {
    stubFetch({ session: fakeSession('admin', 'Avery Admin'), logoutShouldFail: true })

    render(<App />)

    const signOutButton = await screen.findByRole('button', { name: /sign out/i })
    fireEvent.click(signOutButton)

    expect(await screen.findByText(/welcome back/i)).toBeInTheDocument()
  })

  it('UC-01-E2 double-clicking Sign out rapidly does not throw, and still ends on the login screen', async () => {
    const fetchMock = stubFetch({ session: fakeSession('teacher', 'Taylor Teacher'), logoutShouldFail: true })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<App />)

    const signOutButton = await screen.findByRole('button', { name: /sign out/i })

    // Both clicks are fired inside one `act` so React hasn't yet swapped the
    // tree over to the login screen between them — this is what makes it a
    // genuine "both clicks register" double-click rather than one click
    // followed by a no-op on an already-unmounted button.
    expect(() => {
      act(() => {
        fireEvent.click(signOutButton)
        fireEvent.click(signOutButton)
      })
    }).not.toThrow()

    expect(await screen.findByText(/welcome back/i)).toBeInTheDocument()

    const logoutCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/auth/logout'))
    expect(logoutCalls.length).toBe(2)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-01.5 "Back to dashboard" from Profile returns an admin to AdminDashboardPage', async () => {
    stubFetch({ session: fakeSession('admin', 'Avery Admin'), logoutShouldFail: false })

    render(<App />)

    const profileButton = await screen.findByRole('button', { name: /^profile$/i })
    fireEvent.click(profileButton)

    const backLink = await screen.findByText(/back to dashboard/i)
    fireEvent.click(backLink)

    expect(await screen.findByText(/welcome, avery admin/i)).toBeInTheDocument()
  })

  it('AC-01.5 "Back to dashboard" from Profile returns a teacher to RoleHome', async () => {
    stubFetch({ session: fakeSession('teacher', 'Taylor Teacher'), logoutShouldFail: false })

    render(<App />)

    const profileButton = await screen.findByRole('button', { name: /^profile$/i })
    fireEvent.click(profileButton)

    const backLink = await screen.findByText(/back to dashboard/i)
    fireEvent.click(backLink)

    expect(await screen.findByText(/welcome, taylor teacher/i)).toBeInTheDocument()
  })
})
