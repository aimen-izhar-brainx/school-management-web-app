export interface DeleteImpact {
  className: string
  sections: number
  subjectAssignments: number
  students: number
}

export const PLAIN_DELETE_CONFIRM = 'Delete this class? This cannot be undone.'

const plural = (count: number, singular: string, pluralForm: string) =>
  `${count} ${count === 1 ? singular : pluralForm}`

/** Confirmation text for deleting a class; the plain confirmation when nothing else is affected. */
export function deleteImpactMessage(impact: DeleteImpact): string {
  const deleted = [
    impact.sections > 0 ? plural(impact.sections, 'section', 'sections') : null,
    impact.subjectAssignments > 0 ? plural(impact.subjectAssignments, 'subject assignment', 'subject assignments') : null,
  ].filter((part): part is string => part !== null)

  const sentences: string[] = []
  if (deleted.length > 0) sentences.push(`Deleting ${impact.className} will also delete ${deleted.join(' and ')}.`)
  if (impact.students > 0) {
    sentences.push(`${plural(impact.students, 'student', 'students')} will be unassigned from their section.`)
  }
  return sentences.length > 0 ? sentences.join(' ') : PLAIN_DELETE_CONFIRM
}
