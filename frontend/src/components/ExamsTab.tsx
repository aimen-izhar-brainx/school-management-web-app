import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ClipboardList, ClipboardPen, Eye, Pencil, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatExamDate, type Exam } from '../data/exams'
import { sectionLabel } from '../lib/attendance'
import { deleteExam } from '../lib/exams'
import { destructiveIconButton, fieldClass, iconButton, markingStatus, secondaryButton, sectionName } from './examStyles'
import { EmptyState, MarkingBadge } from './examUi'
import { MarkEntryLoader } from './MarkEntryLoader'
import { Overlay } from './Overlay'
import type { Notify } from './useToasts'
import type { ExamData } from './useExamData'

interface ExamsTabProps {
  data: ExamData
  canEnterMarks: boolean
  canManageExams: boolean
  onEdit: (exam: Exam) => void
  onChanged: () => void
  notify: Notify
}

type SortKey = 'exam' | 'class' | 'date' | 'status'
type SortDir = 'asc' | 'desc'

interface Row {
  exam: Exam
  entered: number
  total: number
}

const PAGE_SIZES = [25, 50]
const STATUS_ORDER = { none: 0, partial: 1, complete: 2 }

function compare(a: Row, b: Row, key: SortKey, name: (sectionId: string) => string): number {
  switch (key) {
    case 'exam':
      return `${a.exam.subject} ${a.exam.name}`.localeCompare(`${b.exam.subject} ${b.exam.name}`)
    case 'class':
      return name(a.exam.sectionId).localeCompare(name(b.exam.sectionId))
    case 'date':
      return a.exam.date.localeCompare(b.exam.date)
    case 'status':
      return STATUS_ORDER[markingStatus(a.entered, a.total)] - STATUS_ORDER[markingStatus(b.entered, b.total)]
  }
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-xs font-medium text-slate-800">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="rounded-full p-1 text-slate-600 transition-colors duration-150 ease-out hover:bg-slate-200"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </span>
  )
}

/** Filterable, sortable, paginated exam list with a mark-entry drawer and a named delete confirmation. */
export function ExamsTab({ data, canEnterMarks, canManageExams, onEdit, onChanged, notify }: ExamsTabProps) {
  const nameOf = (sectionId: string) => sectionName(data.sections, sectionId)
  const subjectOptions = useMemo(() => [...new Set(data.exams.map((exam) => exam.subject))].sort(), [data.exams])
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'date', dir: 'desc' })
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const [page, setPage] = useState(1)
  const [openExamId, setOpenExamId] = useState<string | null>(null)
  const [openMode, setOpenMode] = useState<'edit' | 'view'>('view')
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null)
  const [deleting, setDeleting] = useState(false)

  const rows: Row[] = useMemo(
    () =>
      data.exams.map((exam) => ({
        exam,
        entered: exam.markCount,
        total: exam.studentCount,
      })),
    [data],
  )

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows
      .filter(({ exam }) => !classFilter || exam.sectionId === classFilter)
      .filter(({ exam }) => !subjectFilter || exam.subject === subjectFilter)
      .filter(({ exam }) => !term || `${exam.subject} ${exam.name}`.toLowerCase().includes(term))
      .sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * compare(a, b, sort.key, (id) => sectionName(data.sections, id)))
  }, [rows, search, classFilter, subjectFilter, sort, data.sections])

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * pageSize
  const pageRows = visible.slice(start, start + pageSize)

  const activeFilters = [
    search.trim() && { label: `Search: ${search.trim()}`, clear: () => setSearch('') },
    classFilter && { label: nameOf(classFilter), clear: () => setClassFilter('') },
    subjectFilter && { label: subjectFilter, clear: () => setSubjectFilter('') },
  ].filter(Boolean) as { label: string; clear: () => void }[]

  const clearAll = () => {
    setSearch('')
    setClassFilter('')
    setSubjectFilter('')
    setPage(1)
  }

  const toggleSort = (key: SortKey) => {
    setSort((current) => (current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' ? 'desc' : 'asc' }))
  }

  const openExam = data.exams.find((exam) => exam.id === openExamId)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deleteExam(pendingDelete.exam.id)
      if (openExamId === pendingDelete.exam.id) setOpenExamId(null)
      notify('success', `Deleted ${pendingDelete.exam.subject} · ${pendingDelete.exam.name}.`)
      setPendingDelete(null)
      onChanged()
    } catch {
      notify('error', 'The exam could not be deleted. Try again.')
    } finally {
      setDeleting(false)
    }
  }

  if (data.exams.length === 0) {
    return (
      <EmptyState icon={ClipboardList} title="No exams yet">
        {canManageExams ? (
          <>
            Exams you create appear here, ready for marks. Use <strong className="font-semibold">Create exam</strong> to schedule the first one.
          </>
        ) : (
          'Exams scheduled by an admin appear here, ready for marks.'
        )}
      </EmptyState>
    )
  }

  const sortHeader = (key: SortKey, label: string, align = 'text-left') => {
    const active = sort.key === key
    const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600 ${align}`}
      >
        <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-slate-900">
          {label}
          <Icon className={`size-4 ${active ? 'text-slate-900' : 'text-slate-400'}`} aria-hidden="true" />
        </button>
      </th>
    )
  }

  const openDrawer = (examId: string, mode: 'edit' | 'view') => {
    setOpenMode(mode)
    setOpenExamId(examId)
  }
  const markButton = (row: Row) => (
    <>
      {canEnterMarks && (
        <button
          type="button"
          onClick={() => openDrawer(row.exam.id, 'edit')}
          className={iconButton}
          aria-label={`${row.entered > 0 ? 'Edit marks' : 'Enter marks'} for ${row.exam.subject} ${row.exam.name}`}
          title={row.entered > 0 ? 'Edit marks' : 'Enter marks'}
        >
          <ClipboardPen className="size-4" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={() => openDrawer(row.exam.id, 'view')}
        className={iconButton}
        aria-label={`View marks for ${row.exam.subject} ${row.exam.name}`}
        title="View marks"
      >
        <Eye className="size-4" aria-hidden="true" />
      </button>
    </>
  )
  const editButton = (row: Row) => (
    <button
      type="button"
      onClick={() => onEdit(row.exam)}
      className={iconButton}
      aria-label={`Edit ${row.exam.subject} ${row.exam.name}`}
      title="Edit exam"
    >
      <Pencil className="size-4" aria-hidden="true" />
    </button>
  )
  const deleteButton = (row: Row) => (
    <button
      type="button"
      onClick={() => setPendingDelete(row)}
      className={destructiveIconButton}
      aria-label={`Delete ${row.exam.subject} ${row.exam.name}`}
      title="Delete exam"
    >
      <Trash2 className="size-4" aria-hidden="true" />
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="relative">
            <label htmlFor="exam-search" className="sr-only">
              Search exams
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              id="exam-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Search by subject or exam"
              className={`${fieldClass} mt-0 pl-9`}
            />
          </div>
          <div>
            <label htmlFor="exam-filter-class" className="sr-only">
              Filter by class
            </label>
            <select
              id="exam-filter-class"
              value={classFilter}
              onChange={(event) => {
                setClassFilter(event.target.value)
                setPage(1)
              }}
              className={`${fieldClass} mt-0`}
            >
              <option value="">All classes</option>
              {data.sections.map((option) => (
                <option key={option.id} value={option.id}>
                  {sectionLabel(option)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="exam-filter-subject" className="sr-only">
              Filter by subject
            </label>
            <select
              id="exam-filter-subject"
              value={subjectFilter}
              onChange={(event) => {
                setSubjectFilter(event.target.value)
                setPage(1)
              }}
              className={`${fieldClass} mt-0`}
            >
              <option value="">All subjects</option>
              {subjectOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
            {activeFilters.map((filter) => (
              <FilterChip key={filter.label} label={filter.label} onRemove={filter.clear} />
            ))}
            {activeFilters.length > 1 && (
              <button type="button" onClick={clearAll} className="px-2 py-1 text-xs font-medium text-slate-700 underline hover:text-slate-900">
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Search} title="No exams match these filters">
          <button type="button" onClick={clearAll} className={`${secondaryButton} mt-3`}>
            Clear filters
          </button>
        </EmptyState>
      ) : (
        <>
          {/* Desktop and tablet: table with a sticky header. */}
          <div className="hidden max-h-[32rem] overflow-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {sortHeader('exam', 'Exam')}
                  {sortHeader('class', 'Class')}
                  {sortHeader('date', 'Date')}
                  {sortHeader('status', 'Marking')}
                  <th scope="col" className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 text-right text-xs font-medium text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((row) => (
                  <tr key={row.exam.id}>
                    <td className="max-w-[16rem] px-4 py-3">
                      <p className="truncate font-semibold text-slate-900" title={`${row.exam.subject} · ${row.exam.name}`}>
                        {row.exam.subject}
                      </p>
                      <p className="truncate text-xs text-slate-600">
                        {row.exam.name} · {row.exam.totalMarks} marks
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{nameOf(row.exam.sectionId)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatExamDate(row.exam.date)}</td>
                    <td className="px-4 py-3">
                      <MarkingBadge entered={row.entered} total={row.total} />
                      <p className="mt-1 text-xs text-slate-600">
                        {row.entered} of {row.total} students
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {markButton(row)}
                        {canManageExams && editButton(row)}
                        {canManageExams && deleteButton(row)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: the same rows as stacked cards instead of a horizontally scrolling table. */}
          <ul className="space-y-3 md:hidden">
            {pageRows.map((row) => (
              <li key={row.exam.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-900">{row.exam.subject}</p>
                <p className="text-xs text-slate-600">
                  {row.exam.name} · {row.exam.totalMarks} marks
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  {nameOf(row.exam.sectionId)} · {formatExamDate(row.exam.date)}
                </p>
                <div className="mt-2">
                  <MarkingBadge entered={row.entered} total={row.total} />
                  <span className="ml-2 text-xs text-slate-600">
                    {row.entered} of {row.total} students
                  </span>
                </div>
                <div className="mt-4 flex gap-2">
                  {markButton(row)}
                  {canManageExams && editButton(row)}
                        {canManageExams && deleteButton(row)}
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              Showing {start + 1}–{start + pageRows.length} of {visible.length}
            </p>
            <div className="flex items-center gap-3">
              <label htmlFor="exam-page-size" className="text-xs text-slate-600">
                Rows per page
              </label>
              <select
                id="exam-page-size"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                }}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 1}
                className={secondaryButton}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Previous
              </button>
              <span className="text-xs text-slate-600">
                Page {currentPage} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage === pageCount}
                className={secondaryButton}
                aria-label="Next page"
              >
                Next
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      )}

      {openExam && (
        <MarkEntryLoader
          key={openExam.id}
          exam={openExam}
          sections={data.sections}
          scale={data.scale}
          canEdit={canEnterMarks && openMode === 'edit'}
          onSaved={onChanged}
          onClose={() => setOpenExamId(null)}
          notify={notify}
        />
      )}

      {pendingDelete && (
        <Overlay
          variant="modal"
          size="sm"
          title={`Delete ${pendingDelete.exam.subject} · ${pendingDelete.exam.name}?`}
          description={`${nameOf(pendingDelete.exam.sectionId)} · ${formatExamDate(pendingDelete.exam.date)}`}
          onClose={() => setPendingDelete(null)}
          footer={
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setPendingDelete(null)} className={secondaryButton}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center justify-center rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-red-800 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete exam'}
              </button>
            </div>
          }
        >
          <p className="text-sm text-slate-700">
            {pendingDelete.entered > 0
              ? `This permanently removes the exam and the ${pendingDelete.entered} ${pendingDelete.entered === 1 ? 'mark' : 'marks'} entered for it. It also disappears from report cards.`
              : 'This permanently removes the exam. No marks have been entered for it yet.'}
          </p>
        </Overlay>
      )}
    </div>
  )
}
