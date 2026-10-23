import { useEffect, useState } from 'react'
import { getSectionRoster, type AttendanceStudent } from '../lib/attendance'

/** Loads the roster of one section; empty until it arrives. */
export function useSectionRoster(sectionId: string) {
  const [loaded, setLoaded] = useState<{ sectionId: string; students: AttendanceStudent[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sectionId) return
    let active = true
    setError(null)
    getSectionRoster(sectionId)
      .then((students) => {
        if (active) setLoaded({ sectionId, students })
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load the class roster.')
      })
    return () => {
      active = false
    }
  }, [sectionId])

  const ready = loaded?.sectionId === sectionId
  return { roster: ready ? loaded.students : [], loading: !!sectionId && !ready && !error, error }
}
