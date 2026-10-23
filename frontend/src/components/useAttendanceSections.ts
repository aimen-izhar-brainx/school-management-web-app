import { useEffect, useState } from 'react'
import { listSections, type AttendanceSection } from '../lib/attendance'

/** Loads the sections (with rosters) the signed-in user can mark or browse. */
export function useAttendanceSections() {
  const [sections, setSections] = useState<AttendanceSection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    listSections()
      .then((result) => {
        if (active) setSections(result)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load classes.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return { sections, loading, error }
}
