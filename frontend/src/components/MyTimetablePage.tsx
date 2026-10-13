import { useEffect, useState } from 'react'
import type { AuthUser } from '../lib/auth'
import { GENERIC_ERROR } from '../lib/errorMessage'
import { api } from '../lib/http'
import { cellKey } from '../lib/timetable'
import type { DayId, MyTimetable } from '../lib/types'
import { DashboardShell } from './DashboardShell'
import { TimetableGrid } from './TimetableGrid'

interface MyTimetablePageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
}

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; timetable: MyTimetable }

function toEntryMap<E extends { periodId: string; dayOfWeek: DayId }>(entries: E[]) {
  return Object.fromEntries(entries.map((entry) => [cellKey(entry.periodId, entry.dayOfWeek), entry]))
}

function Message({ children }: { children: string }) {
  return <p className="mt-6 text-sm text-slate-500">{children}</p>
}

function Timetable({ timetable }: { timetable: MyTimetable }) {
  if (timetable.kind === 'teacher') {
    return (
      <>
        {timetable.entries.length === 0 && <Message>No classes scheduled yet.</Message>}
        <TimetableGrid
          periods={timetable.periods}
          entries={toEntryMap(timetable.entries)}
          label={(entry) => `${entry.subject.name} — ${entry.class.name}-${entry.section.name}`}
          editable={false}
        />
      </>
    )
  }

  if (!timetable.section) {
    return <Message>You haven't been assigned to a class section yet. Contact your school admin.</Message>
  }

  return (
    <>
      {timetable.entries.length === 0 && <Message>Your class's timetable hasn't been set up yet.</Message>}
      <TimetableGrid
        periods={timetable.periods}
        entries={toEntryMap(timetable.entries)}
        caption={(entry) => entry.teacher.name}
        editable={false}
      />
    </>
  )
}

/** Read-only weekly timetable for teachers (all their sections) and students (their section). */
export function MyTimetablePage({ onBack, onSignOut }: MyTimetablePageProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let isStale = false
    api
      .get<MyTimetable>('/timetable/me')
      .then((timetable) => {
        if (!isStale) setState({ status: 'ready', timetable })
      })
      .catch(() => {
        if (!isStale) setState({ status: 'error' })
      })
    return () => {
      isStale = true
    }
  }, [])

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-6xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">My timetable</h1>
      {state.status === 'loading' && <Message>Loading your timetable...</Message>}
      {state.status === 'error' && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {GENERIC_ERROR}
        </p>
      )}
      {state.status === 'ready' && <Timetable timetable={state.timetable} />}
    </DashboardShell>
  )
}
