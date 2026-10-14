import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { AttendancePage } from './AttendancePage'
import type { AuthUser } from '../lib/auth'
import { api } from '../lib/http'

// Test for T-007 / UC-03-E2 large roster regression: AttendancePage's "Browse & edit" section must
// render a large roster (50+ students) without errors.
//
// T-035 rewired "Browse & edit" onto the real admin attendance API (`GET`/`PATCH
// /attendance/admin/sections/:sectionId/days/:date`, plus `GET /classes` + `GET
// /classes/:classId/sections` for the section picker), replacing the old `data/attendance.ts`
// mock-data path (`rosterFor`/`INITIAL_ATTENDANCE_RECORDS`) this test used to stub. Stubbing that
// module no longer has any effect on the rendered roster, so this test now mocks the HTTP layer
// instead — same pattern as `AttendancePage.test.tsx` — returning a single section whose admin GET
// response carries 62 entries. Data now loads asynchronously, so assertions use `findByText`/
// `waitFor` rather than synchronous queries.
vi.mock('../lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/http')>()
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  }
})

const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> }

const user: AuthUser = { id: 'admin-1', name: 'Avery Admin', email: 'avery@example.com', role: 'admin' }

const BIG_CLASS_ID = 'c-big'
const BIG_SECTION_ID = 'big-section'

const CLASSES = [{ id: BIG_CLASS_ID, name: 'Grade 9' }]
const SECTIONS = [{ id: BIG_SECTION_ID, name: 'Z', classTeacher: null }]

// 62-student roster, matching the real admin GET response shape:
// `{ submitted, locked, entries: [{ student: { id, name }, status }], submittedBy, submittedAt, edits }`.
const bigRoster = Array.from({ length: 62 }, (_, index) => ({ id: `big-${index}`, name: `Student ${index}` }))
const bigEntries = bigRoster.map((student, index) => ({
  student,
  status: index % 7 === 0 ? 'leave' : index % 3 === 0 ? 'absent' : 'present',
}))

const bigDayResponse = {
  submitted: true,
  locked: true,
  entries: bigEntries,
  submittedBy: { id: 't-big', name: 'Class teacher' },
  submittedAt: '2026-01-05T08:45:00.000Z',
  edits: [],
}

describe('AttendancePage (T-007 / UC-03-E2 large roster regression)', () => {
  it('UC-03-E2 renders a 50+ student roster without throwing', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/classes') return Promise.resolve(CLASSES)
      if (path === `/classes/${BIG_CLASS_ID}/sections`) return Promise.resolve(SECTIONS)
      // Match on section id only — the big section's fixture applies regardless of whichever
      // date the page defaults `browse-date` to.
      if (path.startsWith(`/attendance/admin/sections/${BIG_SECTION_ID}/days/`)) {
        return Promise.resolve(bigDayResponse)
      }
      return Promise.reject(new Error(`unexpected GET ${path}`))
    })

    expect(() => render(<AttendancePage user={user} onBack={vi.fn()} onSignOut={vi.fn()} />)).not.toThrow()

    await waitFor(() => expect(document.getElementById('browse-section')).not.toBeNull())

    expect(await screen.findByText('Student 0')).toBeInTheDocument()
    expect(await screen.findByText('Student 61')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(62)
  })
})
