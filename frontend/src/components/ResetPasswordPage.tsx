import { ArrowLeft, Check, CircleCheck, Loader2, LockKeyhole, TriangleAlert, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { PasswordResetError, resetPassword, verifyResetToken } from '../lib/auth'
import { meetsPasswordRules, passwordRules, scorePassword } from '../lib/password'
import { AuthShell } from './AuthShell'
import { PasswordField } from './PasswordField'

interface ResetPasswordPageProps {
  /** Token lifted from the ?token= query param on the emailed link. */
  token: string
  onSignIn: () => void
  onRequestNewLink: () => void
}

type Status = 'verifying' | 'ready' | 'invalid' | 'done'

export function ResetPasswordPage({ token, onSignIn, onRequestNewLink }: ResetPasswordPageProps) {
  const [status, setStatus] = useState<Status>('verifying')
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    verifyResetToken(token)
      .then(({ email }) => {
        if (!active) return
        setAccountEmail(email)
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(
          cause instanceof PasswordResetError
            ? cause.message
            : 'We could not check this reset link.',
        )
        setStatus('invalid')
      })

    return () => {
      active = false
    }
  }, [token])

  const strength = scorePassword(password)
  const mismatch = confirmation.length > 0 && confirmation !== password

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!meetsPasswordRules(password)) {
      setError('Your password does not meet all the requirements below.')
      return
    }

    if (password !== confirmation) {
      setError('Both passwords must match.')
      return
    }

    setIsSubmitting(true)
    try {
      await resetPassword({ token, password })
      setStatus('done')
    } catch (cause) {
      setError(
        cause instanceof PasswordResetError
          ? cause.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      heading="Pick a password you'll keep."
      blurb="Your new password unlocks every part of Brainx School — make it long, unique, and yours alone."
    >
      {status === 'verifying' && (
        <div className="flex flex-col items-center py-10 text-center">
          <Loader2 className="size-6 animate-spin text-violet-600" />
          <p className="mt-4 text-sm text-slate-500">Checking your reset link…</p>
        </div>
      )}

      {status === 'invalid' && (
        <div>
          <span className="flex size-11 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <TriangleAlert className="size-5" />
          </span>

          <h2 className="mt-4 text-2xl font-bold text-slate-900">This link no longer works</h2>
          <p className="mt-2 text-sm text-slate-500">
            {error} Reset links are single-use and time-limited, so request a fresh one to continue.
          </p>

          <button
            type="button"
            onClick={onRequestNewLink}
            className="mt-8 flex w-full items-center justify-center rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
          >
            Request a new link
          </button>

          <button
            type="button"
            onClick={onSignIn}
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
          >
            <ArrowLeft className="size-4" />
            Back to sign in
          </button>
        </div>
      )}

      {status === 'done' && (
        <div>
          <span className="flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CircleCheck className="size-5" />
          </span>

          <h2 className="mt-4 text-2xl font-bold text-slate-900">Password updated</h2>
          <p className="mt-2 text-sm text-slate-500">
            Your password has been changed. Any other devices signed in to your account have been
            signed out.
          </p>

          <button
            type="button"
            onClick={onSignIn}
            className="mt-8 flex w-full items-center justify-center rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
          >
            Continue to sign in
          </button>
        </div>
      )}

      {status === 'ready' && (
        <div>
          <span className="flex size-11 items-center justify-center rounded-full bg-violet-50 text-violet-600">
            <LockKeyhole className="size-5" />
          </span>

          <h2 className="mt-4 text-2xl font-bold text-slate-900">Set a new password</h2>
          <p className="mt-2 text-sm text-slate-500">
            Choose a new password for{' '}
            <span className="font-medium text-slate-900">{accountEmail}</span>.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
            <div>
              <PasswordField
                id="new-password"
                label="New password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                describedBy="password-requirements"
              />

              {password.length > 0 && (
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
                    <span className={`text-xs font-medium ${strength.textColor}`}>
                      {strength.label}
                    </span>
                  </div>

                  <ul id="password-requirements" className="mt-3 space-y-1.5">
                    {passwordRules.map((rule) => {
                      const passed = rule.test(password)
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
                id="confirm-password"
                label="Confirm new password"
                value={confirmation}
                onChange={setConfirmation}
                autoComplete="new-password"
                invalid={mismatch}
                describedBy={mismatch ? 'confirm-password-error' : undefined}
              />
              {mismatch && (
                <p id="confirm-password-error" className="mt-1.5 text-xs text-red-600">
                  Both passwords must match.
                </p>
              )}
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Reset password
            </button>
          </form>

          <button
            type="button"
            onClick={onSignIn}
            className="mt-8 inline-flex w-full items-center justify-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
          >
            <ArrowLeft className="size-4" />
            Back to sign in
          </button>
        </div>
      )}
    </AuthShell>
  )
}
