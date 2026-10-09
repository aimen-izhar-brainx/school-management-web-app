import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { MyTimetablePage } from './MyTimetablePage'
import type { AuthUser } from '../lib/auth'

// Test for T-008 / UC-04-E1: MyTimetablePage must not crash computing a
// student's schedule when `SECTION_OPTIONS` is empty. Every other export is
// left untouched via `importOriginal`.
vi.mock('../data/timetable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/timetable')>()
  return { ...actual, SECTION_OPTIONS: [] }
})

const user: AuthUser = { id: 'student-1', name: 'Jamie Student', email: 'jamie@example.com', role: 'student' }

describe('MyTimetablePage (T-008 empty SECTION_OPTIONS regression)', () => {
  it('UC-04-E1 does not crash computing a student schedule when SECTION_OPTIONS is empty', () => {
    expect(() => render(<MyTimetablePage user={user} onBack={vi.fn()} onSignOut={vi.fn()} />)).not.toThrow()
  })
})
