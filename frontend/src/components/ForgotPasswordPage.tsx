import { ArrowLeft, KeyRound, Loader2, MailCheck, RotateCw } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { PasswordResetError, requestPasswordReset, RESET_LINK_TTL_LABEL } from '../lib/auth'
import { AuthShell } from './AuthShell'

interface ForgotPasswordPageProps {
  onBackToSignIn: () => void
}

/** Seconds before the link can be sent again — keeps mailboxes (and the API) calm. */
const RESEND_COOLDOWN = 45

export function ForgotPasswordPage({ onBackToSignIn }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const send = async (address: string) => {
    setError(null)
    setIsSubmitting(true)
    try {
      await requestPasswordReset(address)
      setSentTo(address.trim())
      setCooldown(RESEND_COOLDOWN)
    } catch (cause) {
      setError(
        cause instanceof PasswordResetError
          ? cause.message
          : 'We could not send the link. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.')
      return
    }

    void send(email)
  }

  return (
    <AuthShell
      heading="Locked out? It happens."
      blurb="We'll email you a secure link so you can set a new password and get back to your dashboard."
    >
      <button
        type="button"
        onClick={onBackToSignIn}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
      >
        <ArrowLeft className="size-4" />
        Back to sign in
      </button>

      {sentTo ? (
        <div>
          <span className="flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <MailCheck className="size-5" />
          </span>

          <h2 className="mt-4 text-2xl font-bold text-slate-900">Check your email</h2>
          <p className="mt-2 text-sm text-slate-500">
            We sent a password reset link to{' '}
            <span className="font-medium text-slate-900">{sentTo}</span>. The link expires in{' '}
            {RESET_LINK_TTL_LABEL}.
          </p>

          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
            Nothing in your inbox? Check the spam folder, and make sure the address above is the one
            your school has on file.
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void send(sentTo)}
            disabled={isSubmitting || cooldown > 0}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCw className="size-4" />
            )}
            {cooldown > 0 ? `Resend link in ${cooldown}s` : 'Resend link'}
          </button>

          <button
            type="button"
            onClick={() => {
              setSentTo(null)
              setError(null)
            }}
            className="mt-4 w-full text-center text-sm font-medium text-violet-600 transition-colors hover:text-violet-700"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <div>
          <span className="flex size-11 items-center justify-center rounded-full bg-violet-50 text-violet-600">
            <KeyRound className="size-5" />
          </span>

          <h2 className="mt-4 text-2xl font-bold text-slate-900">Forgot your password?</h2>
          <p className="mt-2 text-sm text-slate-500">
            Enter the email tied to your account and we'll send you a link to reset it.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
            <div>
              <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700">
                Email address
              </label>
              <input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                aria-invalid={error ? true : undefined}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
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
              Send reset link
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            Still stuck? Contact your school administrator.
          </p>
        </div>
      )}
    </AuthShell>
  )
}
