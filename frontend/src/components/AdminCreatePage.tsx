import { CircleCheck, GraduationCap, UserRound, Users } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import type { AuthUser } from '../lib/auth'
import { isValidEmail } from '../lib/validators'
import { DashboardShell } from './DashboardShell'
import { Input } from './Input'
import { Select } from './Select'

interface AdminCreatePageProps {
  user: AuthUser
  /** Which tab to land on — set by the quick-action the admin clicked from the dashboard. */
  initialTab: PersonTab
  onBack: () => void
  onSignOut: () => void
}

export type PersonTab = 'teacher' | 'student' | 'parent'

const tabs: { id: PersonTab; label: string; icon: typeof Users; activeClasses: string; badgeClasses: string }[] = [
  {
    id: 'teacher',
    label: 'Add teacher',
    icon: Users,
    activeClasses: 'border-blue-200 bg-blue-50 text-blue-700',
    badgeClasses: 'bg-blue-50 text-blue-600',
  },
  {
    id: 'student',
    label: 'Add student',
    icon: GraduationCap,
    activeClasses: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    badgeClasses: 'bg-emerald-50 text-emerald-600',
  },
  {
    id: 'parent',
    label: 'Add parent',
    icon: UserRound,
    activeClasses: 'border-amber-200 bg-amber-50 text-amber-700',
    badgeClasses: 'bg-amber-50 text-amber-600',
  },
]

interface TeacherForm {
  fullName: string
  email: string
  phone: string
  employeeId: string
  subject: string
  joiningDate: string
  gender: string
  address: string
}

const emptyTeacherForm: TeacherForm = {
  fullName: '',
  email: '',
  phone: '',
  employeeId: '',
  subject: '',
  joiningDate: '',
  gender: '',
  address: '',
}

interface StudentForm {
  fullName: string
  dateOfBirth: string
  gender: string
  grade: string
  section: string
  rollNumber: string
  admissionDate: string
  guardianName: string
  guardianPhone: string
  address: string
}

const emptyStudentForm: StudentForm = {
  fullName: '',
  dateOfBirth: '',
  gender: '',
  grade: '',
  section: '',
  rollNumber: '',
  admissionDate: '',
  guardianName: '',
  guardianPhone: '',
  address: '',
}

interface ParentForm {
  fullName: string
  email: string
  phone: string
  relationship: string
  studentName: string
  address: string
}

const emptyParentForm: ParentForm = {
  fullName: '',
  email: '',
  phone: '',
  relationship: '',
  studentName: '',
  address: '',
}

const genderOptions = ['Male', 'Female', 'Other']
const gradeOptions = [
  'Pre-K',
  'Kindergarten',
  ...Array.from({ length: 12 }, (_, index) => `Grade ${index + 1}`),
]
const relationshipOptions = ['Father', 'Mother', 'Guardian']

/** Admin-only screens for adding teachers, students and parents. UI only — nothing is persisted yet. */
export function AdminCreatePage({ user, initialTab, onBack, onSignOut }: AdminCreatePageProps) {
  const [tab, setTab] = useState<PersonTab>(initialTab)

  const [teacherForm, setTeacherForm] = useState<TeacherForm>(emptyTeacherForm)
  const [teacherError, setTeacherError] = useState<string | null>(null)
  const [teacherCreated, setTeacherCreated] = useState<string | null>(null)

  const [studentForm, setStudentForm] = useState<StudentForm>(emptyStudentForm)
  const [studentError, setStudentError] = useState<string | null>(null)
  const [studentCreated, setStudentCreated] = useState<string | null>(null)

  const [parentForm, setParentForm] = useState<ParentForm>(emptyParentForm)
  const [parentError, setParentError] = useState<string | null>(null)
  const [parentCreated, setParentCreated] = useState<string | null>(null)

  const activeTab = tabs.find((candidate) => candidate.id === tab) ?? tabs[0]

  const selectTab = (next: PersonTab) => {
    setTab(next)
  }

  const handleCreateTeacher = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setTeacherError(null)
    setTeacherCreated(null)

    if (!teacherForm.fullName.trim()) {
      setTeacherError('Please enter the teacher’s full name.')
      return
    }
    if (!isValidEmail(teacherForm.email)) {
      setTeacherError('Please enter a valid email address.')
      return
    }

    setTeacherCreated(teacherForm.fullName.trim())
    setTeacherForm(emptyTeacherForm)
  }

  const handleCreateStudent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStudentError(null)
    setStudentCreated(null)

    if (!studentForm.fullName.trim()) {
      setStudentError('Please enter the student’s full name.')
      return
    }
    if (!studentForm.grade) {
      setStudentError('Please select a class / grade.')
      return
    }

    setStudentCreated(studentForm.fullName.trim())
    setStudentForm(emptyStudentForm)
  }

  const handleCreateParent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setParentError(null)
    setParentCreated(null)

    if (!parentForm.fullName.trim()) {
      setParentError('Please enter the parent’s full name.')
      return
    }
    if (!isValidEmail(parentForm.email)) {
      setParentError('Please enter a valid email address.')
      return
    }

    setParentCreated(parentForm.fullName.trim())
    setParentForm(emptyParentForm)
  }

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-4xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Add people</h1>
      <p className="mt-1 text-sm text-slate-500">
        Create teacher, student and parent accounts for {user.name.split(' ')[0]}&rsquo;s school.
      </p>

      <div className="mt-8 flex flex-col gap-8 sm:flex-row">
        <nav className="flex shrink-0 gap-2 sm:w-48 sm:flex-col">
          {tabs.map(({ id, label, icon: Icon, activeClasses }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                tab === id ? activeClasses : 'border-transparent text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="max-w-sm flex-1">
          <span
            className={`flex size-11 items-center justify-center rounded-full ${activeTab.badgeClasses}`}
          >
            <activeTab.icon className="size-5" />
          </span>

          {tab === 'teacher' && (
            <TeacherFormSection
              form={teacherForm}
              onChange={(field, value) => setTeacherForm((prev) => ({ ...prev, [field]: value }))}
              onSubmit={handleCreateTeacher}
              error={teacherError}
              created={teacherCreated}
            />
          )}

          {tab === 'student' && (
            <StudentFormSection
              form={studentForm}
              onChange={(field, value) => setStudentForm((prev) => ({ ...prev, [field]: value }))}
              onSubmit={handleCreateStudent}
              error={studentError}
              created={studentCreated}
            />
          )}

          {tab === 'parent' && (
            <ParentFormSection
              form={parentForm}
              onChange={(field, value) => setParentForm((prev) => ({ ...prev, [field]: value }))}
              onSubmit={handleCreateParent}
              error={parentError}
              created={parentCreated}
            />
          )}
        </div>
      </div>
    </DashboardShell>
  )
}

function TeacherFormSection({
  form,
  onChange,
  onSubmit,
  error,
  created,
}: {
  form: TeacherForm
  onChange: (field: keyof TeacherForm, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  error: string | null
  created: string | null
}) {
  return (
    <div>
      <h2 className="mt-4 text-2xl font-bold text-slate-900">Add teacher</h2>
      <p className="mt-2 text-sm text-slate-500">
        They&rsquo;ll get an email invite to set their password.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <Input
          id="teacher-name"
          label="Full name"
          autoComplete="name"
          value={form.fullName}
          onChange={(value) => onChange('fullName', value)}
        />
        <Input
          id="teacher-email"
          label="Email address"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(value) => onChange('email', value)}
        />
        <Input
          id="teacher-phone"
          label="Phone number"
          type="tel"
          autoComplete="tel"
          placeholder="+1 (555) 123-4567"
          value={form.phone}
          onChange={(value) => onChange('phone', value)}
        />
        <Input
          id="teacher-employee-id"
          label="Employee ID"
          value={form.employeeId}
          onChange={(value) => onChange('employeeId', value)}
        />
        <Input
          id="teacher-subject"
          label="Subject / Department"
          placeholder="e.g. Mathematics"
          value={form.subject}
          onChange={(value) => onChange('subject', value)}
        />
        <Input
          id="teacher-joining-date"
          label="Joining date"
          type="date"
          value={form.joiningDate}
          onChange={(value) => onChange('joiningDate', value)}
        />
        <Select
          id="teacher-gender"
          label="Gender"
          value={form.gender}
          onChange={(value) => onChange('gender', value)}
          options={genderOptions}
        />
        <TextAreaField
          id="teacher-address"
          label="Address"
          value={form.address}
          onChange={(value) => onChange('address', value)}
        />

        <FormMessages error={error} created={created} noun="Teacher" />

        <button
          type="submit"
          className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          Add teacher
        </button>
      </form>
    </div>
  )
}

function StudentFormSection({
  form,
  onChange,
  onSubmit,
  error,
  created,
}: {
  form: StudentForm
  onChange: (field: keyof StudentForm, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  error: string | null
  created: string | null
}) {
  return (
    <div>
      <h2 className="mt-4 text-2xl font-bold text-slate-900">Add student</h2>
      <p className="mt-2 text-sm text-slate-500">
        Enrol a new student and link them to a guardian.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <Input
          id="student-name"
          label="Full name"
          autoComplete="name"
          value={form.fullName}
          onChange={(value) => onChange('fullName', value)}
        />
        <Input
          id="student-dob"
          label="Date of birth"
          type="date"
          value={form.dateOfBirth}
          onChange={(value) => onChange('dateOfBirth', value)}
        />
        <Select
          id="student-gender"
          label="Gender"
          value={form.gender}
          onChange={(value) => onChange('gender', value)}
          options={genderOptions}
        />
        <Select
          id="student-grade"
          label="Class / Grade"
          value={form.grade}
          onChange={(value) => onChange('grade', value)}
          options={gradeOptions}
        />
        <Input
          id="student-section"
          label="Section"
          placeholder="e.g. A"
          value={form.section}
          onChange={(value) => onChange('section', value)}
        />
        <Input
          id="student-roll-number"
          label="Roll number"
          value={form.rollNumber}
          onChange={(value) => onChange('rollNumber', value)}
        />
        <Input
          id="student-admission-date"
          label="Admission date"
          type="date"
          value={form.admissionDate}
          onChange={(value) => onChange('admissionDate', value)}
        />
        <Input
          id="student-guardian-name"
          label="Parent / Guardian name"
          value={form.guardianName}
          onChange={(value) => onChange('guardianName', value)}
        />
        <Input
          id="student-guardian-phone"
          label="Parent / Guardian phone"
          type="tel"
          placeholder="+1 (555) 123-4567"
          value={form.guardianPhone}
          onChange={(value) => onChange('guardianPhone', value)}
        />
        <TextAreaField
          id="student-address"
          label="Address"
          value={form.address}
          onChange={(value) => onChange('address', value)}
        />

        <FormMessages error={error} created={created} noun="Student" />

        <button
          type="submit"
          className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          Add student
        </button>
      </form>
    </div>
  )
}

function ParentFormSection({
  form,
  onChange,
  onSubmit,
  error,
  created,
}: {
  form: ParentForm
  onChange: (field: keyof ParentForm, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  error: string | null
  created: string | null
}) {
  return (
    <div>
      <h2 className="mt-4 text-2xl font-bold text-slate-900">Add parent</h2>
      <p className="mt-2 text-sm text-slate-500">
        They&rsquo;ll get an email invite to set their password.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <Input
          id="parent-name"
          label="Full name"
          autoComplete="name"
          value={form.fullName}
          onChange={(value) => onChange('fullName', value)}
        />
        <Input
          id="parent-email"
          label="Email address"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(value) => onChange('email', value)}
        />
        <Input
          id="parent-phone"
          label="Phone number"
          type="tel"
          autoComplete="tel"
          placeholder="+1 (555) 123-4567"
          value={form.phone}
          onChange={(value) => onChange('phone', value)}
        />
        <Select
          id="parent-relationship"
          label="Relationship to student"
          value={form.relationship}
          onChange={(value) => onChange('relationship', value)}
          options={relationshipOptions}
        />
        <Input
          id="parent-student-name"
          label="Student's name"
          placeholder="Who is this parent linked to?"
          value={form.studentName}
          onChange={(value) => onChange('studentName', value)}
        />
        <TextAreaField
          id="parent-address"
          label="Address"
          value={form.address}
          onChange={(value) => onChange('address', value)}
        />

        <FormMessages error={error} created={created} noun="Parent" />

        <button
          type="submit"
          className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          Add parent
        </button>
      </form>
    </div>
  )
}

function FormMessages({ error, created, noun }: { error: string | null; created: string | null; noun: string }) {
  return (
    <>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}
      {created && !error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-600">
          <CircleCheck className="size-4" />
          {noun} account created for {created}.
        </p>
      )}
    </>
  )
}

function TextAreaField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}): ReactNode {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <textarea
        id={id}
        name={id}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
      />
    </div>
  )
}
