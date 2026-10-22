import { CircleCheck, GraduationCap, UserRound, Users } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { AuthUser } from '../lib/auth'
import { listClasses, type ApiClass } from '../lib/classes'
import { createStudent, createTeacher, type PersonTab } from '../lib/people'
import { passwordRules } from '../lib/password'
import { isValidEmail } from '../lib/validators'
import { DashboardShell } from './DashboardShell'
import { Input } from './Input'
import { PasswordField } from './PasswordField'
import { Select } from './Select'

interface AdminCreatePageProps {
  user: AuthUser
  /** Which tab to land on — set by the quick-action the admin clicked from the dashboard. */
  initialTab: PersonTab
  onBack: () => void
  onSignOut: () => void
}


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
  password: string
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
  password: '',
  phone: '',
  employeeId: '',
  subject: '',
  joiningDate: '',
  gender: '',
  address: '',
}

interface StudentForm {
  fullName: string
  email: string
  password: string
  dateOfBirth: string
  gender: string
  className: string
  section: string
  rollNumber: string
  guardianName: string
  guardianPhone: string
  address: string
}

const emptyStudentForm: StudentForm = {
  fullName: '',
  email: '',
  password: '',
  dateOfBirth: '',
  gender: '',
  className: '',
  section: '',
  rollNumber: '',
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
const relationshipOptions = ['Father', 'Mother', 'Guardian']

/** Admin-only screens for adding teachers, students and parents. Teachers and students are saved through the API; parents are still UI only. */
export function AdminCreatePage({ user, initialTab, onBack, onSignOut }: AdminCreatePageProps) {
  const [tab, setTab] = useState<PersonTab>(initialTab)

  const [teacherForm, setTeacherForm] = useState<TeacherForm>(emptyTeacherForm)
  const [teacherError, setTeacherError] = useState<string | null>(null)
  const [teacherCreated, setTeacherCreated] = useState<string | null>(null)
  const [teacherSubmitting, setTeacherSubmitting] = useState(false)

  const [studentForm, setStudentForm] = useState<StudentForm>(emptyStudentForm)
  const [studentError, setStudentError] = useState<string | null>(null)
  const [studentCreated, setStudentCreated] = useState<string | null>(null)
  const [studentSubmitting, setStudentSubmitting] = useState(false)

  const [parentForm, setParentForm] = useState<ParentForm>(emptyParentForm)
  const [parentError, setParentError] = useState<string | null>(null)
  const [parentCreated, setParentCreated] = useState<string | null>(null)

  const [classes, setClasses] = useState<ApiClass[]>([])
  useEffect(() => {
    listClasses()
      .then(setClasses)
      .catch(() => setClasses([]))
  }, [])

  const activeTab = tabs.find((candidate) => candidate.id === tab) ?? tabs[0]

  const selectTab = (next: PersonTab) => {
    setTab(next)
  }

  const handleCreateTeacher = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setTeacherError(null)
    setTeacherCreated(null)

    const name = teacherForm.fullName.trim()
    if (!name) {
      setTeacherError('Please enter the teacher’s full name.')
      return
    }
    if (!isValidEmail(teacherForm.email)) {
      setTeacherError('Please enter a valid email address.')
      return
    }
    if (!passwordRules.every((rule) => rule.test(teacherForm.password))) {
      setTeacherError('Password must meet all the strength requirements.')
      return
    }
    if (!teacherForm.employeeId.trim() || !teacherForm.subject.trim()) {
      setTeacherError('Please enter the employee ID and subject.')
      return
    }

    setTeacherSubmitting(true)
    try {
      await createTeacher({
        name,
        email: teacherForm.email.trim(),
        password: teacherForm.password,
        employeeId: teacherForm.employeeId.trim(),
        subject: teacherForm.subject.trim(),
        phone: teacherForm.phone,
        gender: teacherForm.gender,
        address: teacherForm.address,
        joinedAt: teacherForm.joiningDate,
      })
      setTeacherCreated(name)
      setTeacherForm(emptyTeacherForm)
    } catch (cause) {
      setTeacherError(cause instanceof Error ? cause.message : 'Could not create the teacher.')
    } finally {
      setTeacherSubmitting(false)
    }
  }

  const handleCreateStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStudentError(null)
    setStudentCreated(null)

    const name = studentForm.fullName.trim()
    if (!name) {
      setStudentError('Please enter the student’s full name.')
      return
    }
    if (!isValidEmail(studentForm.email)) {
      setStudentError('Please enter a valid email address.')
      return
    }
    if (!passwordRules.every((rule) => rule.test(studentForm.password))) {
      setStudentError('Password must meet all the strength requirements.')
      return
    }
    if (!studentForm.rollNumber.trim()) {
      setStudentError('Please enter the roll number.')
      return
    }
    if (!studentForm.guardianName.trim() || !studentForm.guardianPhone.trim()) {
      setStudentError('Please enter the guardian’s name and phone.')
      return
    }

    setStudentSubmitting(true)
    try {
      await createStudent({
        name,
        email: studentForm.email.trim(),
        password: studentForm.password,
        rollNumber: studentForm.rollNumber.trim(),
        guardianName: studentForm.guardianName.trim(),
        guardianPhone: studentForm.guardianPhone.trim(),
        sectionId: classes
          .find((c) => c.name === studentForm.className)
          ?.sections.find((sec) => sec.name === studentForm.section)?.id,
        gender: studentForm.gender,
        dateOfBirth: studentForm.dateOfBirth,
        address: studentForm.address,
      })
      setStudentCreated(name)
      setStudentForm(emptyStudentForm)
    } catch (cause) {
      setStudentError(cause instanceof Error ? cause.message : 'Could not create the student.')
    } finally {
      setStudentSubmitting(false)
    }
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
              submitting={teacherSubmitting}
            />
          )}

          {tab === 'student' && (
            <StudentFormSection
              classes={classes}
              form={studentForm}
              onChange={(field, value) => setStudentForm((prev) => ({ ...prev, [field]: value }))}
              onSubmit={handleCreateStudent}
              error={studentError}
              created={studentCreated}
              submitting={studentSubmitting}
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
  submitting,
}: {
  form: TeacherForm
  onChange: (field: keyof TeacherForm, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  error: string | null
  created: string | null
  submitting: boolean
}) {
  return (
    <div>
      <h2 className="mt-4 text-2xl font-bold text-slate-900">Add teacher</h2>
      <p className="mt-2 text-sm text-slate-500">
        Create the teacher&rsquo;s account and give them a starting password.
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
        <PasswordField
          id="teacher-password"
          label="Temporary password"
          autoComplete="new-password"
          placeholder="Min. 8 chars, upper/lower, number, symbol"
          value={form.password}
          onChange={(value) => onChange('password', value)}
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
          disabled={submitting}
          className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Add teacher'}
        </button>
      </form>
    </div>
  )
}

function StudentFormSection({
  classes,
  form,
  onChange,
  onSubmit,
  error,
  created,
  submitting,
}: {
  classes: ApiClass[]
  form: StudentForm
  onChange: (field: keyof StudentForm, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  error: string | null
  created: string | null
  submitting: boolean
}) {
  const classOptions = classes.map((c) => c.name)
  const sectionOptions = classes.find((c) => c.name === form.className)?.sections.map((sec) => sec.name) ?? []
  return (
    <div>
      <h2 className="mt-4 text-2xl font-bold text-slate-900">Add student</h2>
      <p className="mt-2 text-sm text-slate-500">
        Enrol a new student, create their login and record a guardian.
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
          id="student-email"
          label="Email address"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(value) => onChange('email', value)}
        />
        <PasswordField
          id="student-password"
          label="Temporary password"
          autoComplete="new-password"
          placeholder="Min. 8 chars, upper/lower, number, symbol"
          value={form.password}
          onChange={(value) => onChange('password', value)}
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
          id="student-class"
          label="Class"
          value={form.className}
          onChange={(value) => {
            onChange('className', value)
            onChange('section', '')
          }}
          options={classOptions}
        />
        <Select
          id="student-section"
          label="Section"
          value={form.section}
          onChange={(value) => onChange('section', value)}
          options={sectionOptions}
        />
        <Input
          id="student-roll-number"
          label="Roll number"
          value={form.rollNumber}
          onChange={(value) => onChange('rollNumber', value)}
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
          disabled={submitting}
          className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Add student'}
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
