import { useState } from 'react'
import { validateScale, type GradeBand } from '../data/exams'
import { saveGradeScale } from '../lib/exams'
import type { Notify } from './useToasts'

interface GradeScaleEditorProps {
  scale: GradeBand[]
  /** Admins edit the scale; everyone else sees it read-only. */
  canEdit: boolean
  onSaved: () => void
  notify: Notify
}

/** Marks-to-grade scale: each grade's minimum percentage. The lowest band is fixed at 0 (the failing grade). */
export function GradeScaleEditor({ scale, canEdit, onSaved, notify }: GradeScaleEditorProps) {
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(scale.map((band) => [band.grade, String(band.minPercent)])),
  )

  const lowest = [...scale].sort((a, b) => a.minPercent - b.minPercent)[0].grade

  const handleSave = async () => {
    const next = scale.map((band) => ({
      grade: band.grade,
      minPercent: band.grade === lowest ? 0 : draft[band.grade] === '' ? NaN : Number(draft[band.grade]),
    }))
    const problem = validateScale(next)
    if (problem) {
      notify('error', problem)
      return
    }
    try {
      await saveGradeScale(next)
    } catch (cause) {
      notify('error', cause instanceof Error ? cause.message : 'The grading scale could not be saved.')
      return
    }
    notify('success', 'Grading scale saved.')
    onSaved()
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">Grading scale</h2>
      <p className="mt-1 text-xs text-slate-500">
        A student earns the highest grade whose minimum percentage they reach. {lowest} is the failing grade.
      </p>

      <ul className="mt-4 space-y-2">
        {scale.map((band) => (
          <li key={band.grade} className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-700">
              {band.grade}
            </span>
            <label htmlFor={`scale-${band.grade}`} className="text-sm text-slate-600">
              Minimum %
            </label>
            <input
              id={`scale-${band.grade}`}
              type="number"
              min={0}
              max={100}
              disabled={!canEdit || band.grade === lowest}
              value={band.grade === lowest ? '0' : draft[band.grade]}
              onChange={(event) => setDraft({ ...draft, [band.grade]: event.target.value })}
              className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </li>
        ))}
      </ul>

      {canEdit && (
        <button
          type="button"
          onClick={handleSave}
          className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
        >
          Save scale
        </button>
      )}
    </div>
  )
}
