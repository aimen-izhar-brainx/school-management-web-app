import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import App from './App'
import type { AuthUser } from './lib/auth'

// T-023 AC-17.2: the admin timetable builder view ('admin-timetable') is only
// reachable from AdminDashboardPage's "Timetable" card. Teachers/students are
// rendered RoleHome, which only offers "View timetable" (My Timetable).

function stubSession(role: AuthUser['role']) {
  const session = {
    token: 'fake-access-token',
    user: { id: `${role}-1`, name: 'Pat Person', email: `${role}@example.com`, role },
  }
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/auth/refresh')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => session })
    }
    return Promise.reject(new Error(`unexpected fetch to ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('App role gating for the timetable builder (AC-17.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  for (const role of ['teacher', 'student'] as const) {
    it(`AC-17.2 a ${role} home offers only "View timetable", with no admin timetable builder entry`, async () => {
      const fetchMock = stubSession(role)
      render(<App />)

      expect(await screen.findByRole('button', { name: /view timetable|my timetable/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^timetable$/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /build|manage|edit.*timetable/i })).not.toBeInTheDocument()

      const urls = fetchMock.mock.calls.map((call) => String(call[0]))
      expect(urls.some((u) => u.includes('/periods'))).toBe(false)
      expect(urls.some((u) => /\/timetable/.test(u))).toBe(false)
    })
  }

  it('AC-17.2 sanity: the admin dashboard does offer the Timetable builder entry', async () => {
    stubSession('admin')
    render(<App />)
    expect(await screen.findByRole('button', { name: /timetable/i })).toBeInTheDocument()
  })
})

// T-023 AC-17.2 (user decision): non-admins are ALWAYS shown My Timetable / their Home instead of
// admin-only views, and the view resets to Home on every sign-in and sign-out.
//
// Item 3 of the brief (non-admin session + view 'admin-timetable'/'admin-classes') has no public
// path: restoreSession only runs on mount when the view is 'login', and the only way to hold an
// admin view across users is sign-out -> sign-in, which these tests drive.

// Minimal stand-in for user-event (not installed in this project).
type Actor = {
  type: (el: HTMLElement, text: string) => Promise<void>
  click: (el: HTMLElement) => Promise<void>
}
const actor = (): Actor => ({
  type: async (el, text) => {
    fireEvent.change(el, { target: { value: text } })
  },
  click: async (el) => {
    fireEvent.click(el)
  },
})

function stubLoginFlow() {
  const users: Record<string, AuthUser> = {}
  for (const role of ['admin', 'teacher', 'student'] as const) {
    users[`${role}@example.com`] = { id: `${role}-1`, name: `${role} person`, email: `${role}@example.com`, role }
  }
  const urls: string[] = []
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    urls.push(url)
    const ok = (body: unknown, status = 200) =>
      Promise.resolve({ ok: true, status, json: async () => body })
    if (url.includes('/auth/refresh')) {
      return Promise.resolve({ ok: false, status: 401, json: async () => ({ message: 'no session' }) })
    }
    if (url.includes('/auth/login')) {
      const { email } = JSON.parse(String(init?.body))
      return ok({ token: `token-${email}`, user: users[email] })
    }
    if (url.includes('/auth/logout')) return ok(null, 204)
    if (/\/timetable/.test(url)) return ok({ entries: [] })
    return ok([])
  })
  vi.stubGlobal('fetch', fetchMock)
  return { urls, fetchMock }
}

async function signIn(user: Actor, role: AuthUser['role']) {
  await user.type(await screen.findByLabelText(/email address/i), `${role}@example.com`)
  await user.type(screen.getByLabelText(/^password$/i), 'Password123!')
  await user.click(screen.getByRole('button', { name: /^sign in$/i }))
}

async function signOut(user: Actor) {
  await user.click(await screen.findByRole('button', { name: /sign out/i }))
  await screen.findByRole('heading', { name: /welcome back/i })
}

const isBuilderFetch = (u: string) => /\/periods/.test(u) || /\/sections\/[^/]+\/timetable/.test(u)

describe('App view reset on sign-in/sign-out (AC-17.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  for (const role of ['teacher', 'student'] as const) {
    it(`AC-17.2 a ${role} signing in after an admin left the Timetable builder open lands on Home, with no builder fetch`, async () => {
      const { urls } = stubLoginFlow()
      const user = actor()
      render(<App />)

      await signIn(user, 'admin')
      await user.click(await screen.findByRole('button', { name: /timetable/i }))
      expect(await screen.findByRole('heading', { name: /^timetable$/i })).toBeInTheDocument()
      await signOut(user)

      urls.length = 0
      await signIn(user, role)

      expect(await screen.findByRole('button', { name: /view timetable|my timetable/i })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /welcome, /i })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /^timetable$/i })).not.toBeInTheDocument()
      expect(urls.filter(isBuilderFetch)).toEqual([])
    })

    it(`AC-17.2 a ${role} signing in after an admin left the Classes page open lands on Home, not Classes`, async () => {
      const { urls } = stubLoginFlow()
      const user = actor()
      render(<App />)

      await signIn(user, 'admin')
      await user.click(await screen.findByRole('button', { name: /^classes/i }))
      expect(await screen.findByRole('heading', { name: /^classes$/i })).toBeInTheDocument()
      await signOut(user)

      urls.length = 0
      await signIn(user, role)

      expect(await screen.findByRole('button', { name: /view timetable|my timetable/i })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /^classes$/i })).not.toBeInTheDocument()
      await waitFor(() => expect(urls.some((u) => /\/classes/.test(u))).toBe(false))
    })
  }

  it('AC-17.2 an admin signing in lands on the admin dashboard Home', async () => {
    stubLoginFlow()
    const user = actor()
    render(<App />)

    await signIn(user, 'admin')

    expect(await screen.findByText(/quick navigation/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^timetable$/i })).not.toBeInTheDocument()
  })

  it('AC-17.2 an admin who signs out from the Timetable builder and signs in again starts at Home, not the builder', async () => {
    const { urls } = stubLoginFlow()
    const user = actor()
    render(<App />)

    await signIn(user, 'admin')
    await user.click(await screen.findByRole('button', { name: /timetable/i }))
    expect(await screen.findByRole('heading', { name: /^timetable$/i })).toBeInTheDocument()
    await signOut(user)

    urls.length = 0
    await signIn(user, 'admin')

    expect(await screen.findByText(/quick navigation/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^timetable$/i })).not.toBeInTheDocument()
    expect(urls.filter(isBuilderFetch)).toEqual([])
  })
})
