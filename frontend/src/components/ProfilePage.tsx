import { Camera, Check, CircleCheck, LockKeyhole, UserRound, X } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { AuthUser } from '../lib/auth'
import { meetsPasswordRules, passwordRules, scorePassword } from '../lib/password'
import { DashboardShell } from './DashboardShell'
import { PasswordField } from './PasswordField'

interface ProfilePageProps {
  user: AuthUser
  onBack: () => void
  onSignOut: () => void
  /** Bubbles a name/email change up so the header greeting stays in sync. */
  onProfileUpdated: (update: { name: string; email: string }) => void
}

type Tab = 'profile' | 'password'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function ProfilePage({ user, onBack, onSignOut, onProfileUpdated }: ProfilePageProps) {
  const [tab, setTab] = useState<Tab>('profile')

  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState('')
  const [infoError, setInfoError] = useState<string | null>(null)
  const [infoSaved, setInfoSaved] = useState(false)

  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

  /** Revokes the previous object URL whenever the photo changes or the page unmounts. */
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  }, [photoUrl])

  const strength = scorePassword(newPassword)
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword

  const handleSaveInfo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInfoError(null)
    setInfoSaved(false)

    if (!name.trim()) {
      setInfoError('Please enter your name.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setInfoError('Please enter a valid email address.')
      return
    }

    onProfileUpdated({ name: name.trim(), email: email.trim() })
    setInfoSaved(true)
  }

  const handlePhotoSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setPhotoError(null)

    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose an image file.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('Photos must be 5MB or smaller.')
      return
    }

    setPhotoUrl(URL.createObjectURL(file))
  }

  const handleChangePassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordError(null)
    setPasswordSaved(false)

    if (!currentPassword) {
      setPasswordError('Please enter your current password.')
      return
    }
    if (!meetsPasswordRules(newPassword)) {
      setPasswordError('Your new password does not meet all the requirements below.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Both passwords must match.')
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordSaved(true)
  }

  return (
    <DashboardShell onBack={onBack} onSignOut={onSignOut} mainClassName="mx-auto max-w-4xl px-6 py-12">
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Your profile</h1>
      <p className="mt-1 text-sm text-slate-500">Manage your personal details and password.</p>

      <div className="mt-8 flex flex-col gap-8 sm:flex-row">
        <nav className="flex shrink-0 gap-2 sm:w-48 sm:flex-col">
          <button
            type="button"
            onClick={() => setTab('profile')}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
              tab === 'profile'
                ? 'border-violet-200 bg-violet-50 text-violet-700'
                : 'border-transparent text-slate-600 hover:bg-slate-100'
            }`}
          >
            <UserRound className="size-4" />
            Profile
          </button>
          <button
            type="button"
            onClick={() => setTab('password')}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
              tab === 'password'
                ? 'border-violet-200 bg-violet-50 text-violet-700'
                : 'border-transparent text-slate-600 hover:bg-slate-100'
            }`}
          >
            <LockKeyhole className="size-4" />
            Change password
          </button>
        </nav>

        <div className="max-w-sm flex-1">
          {tab === 'profile' && (
            <div>
              <span className="flex size-11 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                <UserRound className="size-5" />
              </span>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">Profile</h2>
              <p className="mt-2 text-sm text-slate-500">
                Update your photo and personal details.
              </p>

              <div className="mt-6 flex items-center gap-4">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="size-16 rounded-full object-cover" />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-600">
                    {initials(name)}
                  </div>
                )}

                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    <Camera className="size-4" />
                    Change photo
                  </button>
                  <p className="mt-1.5 text-xs text-slate-400">JPG or PNG, up to 5MB.</p>
                </div>
              </div>

              {photoError && (
                <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                  {photoError}
                </p>
              )}

              <form onSubmit={handleSaveInfo} className="mt-8 space-y-4" noValidate>
                <div>
                  <label htmlFor="profile-name" className="block text-sm font-medium text-slate-700">
                    Full name
                  </label>
                  <input
                    id="profile-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>

                <div>
                  <label htmlFor="profile-email" className="block text-sm font-medium text-slate-700">
                    Email address
                  </label>
                  <input
                    id="profile-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>

                <div>
                  <label htmlFor="profile-phone" className="block text-sm font-medium text-slate-700">
                    Phone number
                  </label>
                  <input
                    id="profile-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+1 (555) 123-4567"
                    className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>

                {infoError && (
                  <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                    {infoError}
                  </p>
                )}
                {infoSaved && !infoError && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-600">
                    <CircleCheck className="size-4" />
                    Your profile has been updated.
                  </p>
                )}

                <button
                  type="submit"
                  className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                >
                  Save changes
                </button>
              </form>
            </div>
          )}

          {tab === 'password' && (
            <div>
              <span className="flex size-11 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                <LockKeyhole className="size-5" />
              </span>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">Change password</h2>
              <p className="mt-2 text-sm text-slate-500">
                Choose a new password for <span className="font-medium text-slate-900">{email}</span>.
              </p>

              <form onSubmit={handleChangePassword} className="mt-8 space-y-4" noValidate>
                <PasswordField
                  id="current-password"
                  label="Current password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                />

                <div>
                  <PasswordField
                    id="new-password"
                    label="New password"
                    value={newPassword}
                    onChange={setNewPassword}
                    autoComplete="new-password"
                    describedBy="new-password-requirements"
                  />

                  {newPassword.length > 0 && (
                    <div className="mt-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-1 gap-1" aria-hidden="true">
                          {passwordRules.map((rule, index) => (
                            <span
                              key={rule.id}
                              className={`h-1 flex-1 rounded-full transition-colors ${
                                index < strength.score ? strength.barColor : 'bg-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                        <span className={`text-xs font-medium ${strength.textColor}`}>{strength.label}</span>
                      </div>

                      <ul id="new-password-requirements" className="mt-3 space-y-1.5">
                        {passwordRules.map((rule) => {
                          const passed = rule.test(newPassword)
                          return (
                            <li
                              key={rule.id}
                              className={`flex items-center gap-2 text-xs ${
                                passed ? 'text-emerald-600' : 'text-slate-500'
                              }`}
                            >
                              {passed ? (
                                <Check className="size-3.5 shrink-0" />
                              ) : (
                                <X className="size-3.5 shrink-0 text-slate-300" />
                              )}
                              {rule.label}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </div>

                <div>
                  <PasswordField
                    id="confirm-new-password"
                    label="Confirm new password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    autoComplete="new-password"
                    invalid={mismatch}
                    describedBy={mismatch ? 'confirm-new-password-error' : undefined}
                  />
                  {mismatch && (
                    <p id="confirm-new-password-error" className="mt-1.5 text-xs text-red-600">
                      Both passwords must match.
                    </p>
                  )}
                </div>

                {passwordError && (
                  <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                    {passwordError}
                  </p>
                )}
                {passwordSaved && !passwordError && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-600">
                    <CircleCheck className="size-4" />
                    Your password has been changed.
                  </p>
                )}

                <button
                  type="submit"
                  className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                >
                  Update password
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
