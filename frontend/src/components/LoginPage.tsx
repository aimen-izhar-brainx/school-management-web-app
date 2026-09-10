import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { login, LoginError, type AuthSession } from '../lib/auth'
import { AuthShell } from './AuthShell'
import { PasswordField } from './PasswordField'

interface LoginPageProps {
  onSignedIn: (session: AuthSession) => void
  onForgotPassword: () => void
}

export function LoginPage({ onSignedIn, onForgotPassword }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }

    setIsSubmitting(true)
    try {
      // The role comes back with the session — it is never picked here.
      const session = await login({ email, password, rememberMe })
      onSignedIn(session)
    } catch (cause) {
      setError(
        cause instanceof LoginError ? cause.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      heading="One platform for the whole school community."
      blurb="Admins, teachers, students and parents — one sign-in, and everyone lands on the dashboard built for them."
    >
      <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
      <p className="mt-1 text-sm text-slate-500">Sign in to continue to your dashboard.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          labelAction={
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
            >
              Forgot password?
            </button>
          }
        />

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            className="size-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/10"
          />
          Remember me
        </label>

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
          Sign in
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-500">
        Need an account? Contact your school administrator.
      </p>
    </AuthShell>
  )
}
