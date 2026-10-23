import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { AttendancePage } from './AttendancePage'
import { MarkAttendancePage } from './MarkAttendancePage'
import { MyAttendancePage } from './MyAttendancePage'
import type { AuthUser } from '../lib/auth'
import * as api from '../lib/attendance'

vi.mock('../lib/attendance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/attendance')>()),
  listSections: vi.fn(),
  getSectionRoster: vi.fn(),
  getSectionDay: vi.fn(),
  submitAttendance: vi.fn(),
  correctRecord: vi.fn(),
  getAuditForDay: vi.fn(),
  getDailySummary: vi.fn(),
  getMonthlyForSection: vi.fn(),
  getMyMonth: vi.fn(),
}))

const mocked = vi.mocked(api)
const noop = () => {}
const user = (role: AuthUser['role']): AuthUser => ({ id: 'u1', name: 'Pat', email: 'p@example.com', role })

const section = {
  id: 's1',
  className: 'Grade 5',
  sectionName: 'A',
}

const students = [
  { id: 'st1', name: 'Ava Thompson', rollNumber: '501' },
  { id: 'st2', name: 'Liam Chen', rollNumber: '502' },
]

const session = {
  id: 'a1',
  sectionId: 's1',
  date: '2026-10-22T00:00:00.000Z',
  submittedAt: '2026-10-22T08:45:00.000Z',
  submittedBy: { id: 't1', name: 'Grace Kim' },
  records: [
    { id: 'r1', studentId: 'st1', status: 'present' as const },
    { id: 'r2', studentId: 'st2', status: 'absent' as const },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.listSections.mockResolvedValue([section])
  mocked.getSectionRoster.mockResolvedValue(students)
  mocked.getSectionDay.mockResolvedValue(null)
  mocked.getAuditForDay.mockResolvedValue([])
  mocked.getDailySummary.mockResolvedValue([])
  mocked.getMonthlyForSection.mockResolvedValue([])
})

describe('MarkAttendancePage', () => {
  it('loads the roster from the API and submits the draft', async () => {
    mocked.submitAttendance.mockResolvedValue(session)
    render(<MarkAttendancePage user={user('teacher')} onBack={noop} onSignOut={noop} />)

    expect(await screen.findByText('Ava Thompson')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Absent' })[1])
    fireEvent.click(screen.getByRole('button', { name: /submit attendance/i }))

    await waitFor(() =>
      expect(mocked.submitAttendance).toHaveBeenCalledWith('s1', expect.any(String), { st1: 'present', st2: 'absent' }),
    )
    expect(await screen.findByText(/submitted & locked/i)).toBeInTheDocument()
  })

  it('shows the server error when submitting fails', async () => {
    mocked.submitAttendance.mockRejectedValue(new Error('Already submitted.'))
    render(<MarkAttendancePage user={user('teacher')} onBack={noop} onSignOut={noop} />)

    await screen.findByText('Ava Thompson')
    fireEvent.click(screen.getByRole('button', { name: /submit attendance/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Already submitted.')
  })

  it('shows a locked record when the day was already marked', async () => {
    mocked.getSectionDay.mockResolvedValue(session)
    render(<MarkAttendancePage user={user('teacher')} onBack={noop} onSignOut={noop} />)

    expect(await screen.findByText(/submitted & locked/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit attendance/i })).not.toBeInTheDocument()
  })
})

describe('AttendancePage', () => {
  it('shows a day\'s records, and requires a reason before saving a correction', async () => {
    mocked.getSectionDay.mockResolvedValue(session)
    mocked.correctRecord.mockResolvedValue(session.records[0])
    render(<AttendancePage user={user('admin')} onBack={noop} onSignOut={noop} />)

    fireEvent.click((await screen.findAllByRole('button', { name: /^edit /i }))[0])
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/reason/i)
    expect(mocked.correctRecord).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/reason for correction/i), { target: { value: 'Parent note' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(mocked.correctRecord).toHaveBeenCalledWith('r1', 'leave', 'Parent note'))
  })

  it('shows the not-marked message when there is no record', async () => {
    render(<AttendancePage user={user('admin')} onBack={noop} onSignOut={noop} />)
    expect(await screen.findByText(/not marked yet for grade 5 - a/i)).toBeInTheDocument()
  })
})

describe('MyAttendancePage', () => {
  it('renders the student\'s month from the API', async () => {
    mocked.getMyMonth.mockResolvedValue({
      student: { id: 'st1', section: { id: 's1', name: 'A', schoolClass: { name: 'Grade 5' } } },
      records: [{ id: 'r1', date: '2026-10-22T00:00:00.000Z', status: 'present' }],
      summary: { present: 1, absent: 0, leave: 0, total: 1, percentage: 100 },
    })
    render(<MyAttendancePage user={user('student')} onBack={noop} onSignOut={noop} />)

    expect(await screen.findByText('100%')).toBeInTheDocument()
    expect(screen.getByText(/grade 5 - a/i)).toBeInTheDocument()
  })

  it('does not call the API for a parent', () => {
    render(<MyAttendancePage user={user('parent')} onBack={noop} onSignOut={noop} />)
    expect(mocked.getMyMonth).not.toHaveBeenCalled()
  })
})
