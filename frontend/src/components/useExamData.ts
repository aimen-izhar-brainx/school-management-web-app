import { useCallback, useEffect, useState } from 'react'
import type { Exam, GradeBand } from '../data/exams'
import { getExamData, type ExamSection } from '../lib/exams'

export interface ExamData {
  exams: Exam[]
  sections: ExamSection[]
  scale: GradeBand[]
}

/** Loads the exam store and exposes `reload` for after a write. */
export function useExamData() {
  const [data, setData] = useState<ExamData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setData(await getExamData())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load exams.')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, error, reload }
}
