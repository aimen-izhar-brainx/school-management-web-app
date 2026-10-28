import { useEffect, useState } from 'react'
import type { Exam, GradeBand } from '../data/exams'
import { getSectionMarks, type ExamSection, type SectionMarks } from '../lib/exams'
import { MarkEntry } from './MarkEntry'
import type { Notify } from './useToasts'

interface MarkEntryLoaderProps {
  exam: Exam
  sections: ExamSection[]
  scale: GradeBand[]
  canEdit: boolean
  onSaved: () => void
  onClose: () => void
  notify: Notify
}

/** Fetches the exam's class roster and marks when opened, then hands them to the drawer. Mount it keyed by exam id. */
export function MarkEntryLoader({ exam, onClose, notify, ...rest }: MarkEntryLoaderProps) {
  const [sheet, setSheet] = useState<SectionMarks | null>(null)

  useEffect(() => {
    let live = true
    getSectionMarks(exam.sectionId)
      .then((loaded) => live && setSheet(loaded))
      .catch((cause) => {
        if (!live) return
        notify('error', cause instanceof Error ? cause.message : 'Could not load marks.')
        onClose()
      })
    return () => {
      live = false
    }
    // Load once per mount; the parent remounts this per exam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!sheet) return null
  return <MarkEntry exam={exam} roster={sheet.roster} marks={sheet.marks[exam.id] ?? {}} onClose={onClose} notify={notify} {...rest} />
}
