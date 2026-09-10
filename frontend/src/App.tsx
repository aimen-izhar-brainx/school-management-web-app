import { useEffect, useRef, useState } from 'react'
import { ForgotPasswordPage } from './components/ForgotPasswordPage'
import { LoginPage } from './components/LoginPage'
import { ResetPasswordPage } from './components/ResetPasswordPage'
import { RoleHome } from './components/RoleHome'
import { logout, restoreSession, type AuthSession } from './lib/auth'

type View = { name: 'login' } | { name: 'forgot' } | { name: 'reset'; token: string }

/**
 * The emailed link points at /?token=…, so the token in the URL decides the
 * first screen. Swap this for a router once there are more routes.
 */
function initialView(): View {
  const token = new URLSearchParams(window.location.search).get('token')
  return token ? { name: 'reset', token } : { name: 'login' }
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [view, setView] = useState<View>(initialView)
  const [isRestoring, setIsRestoring] = useState(true)
  const hasRestoredRef = useRef(false)

  /**
   * The refresh cookie survives a reload — try to resume the session before showing the login
   * screen. Guarded by a ref (not just a `let active` flag) because the refresh token is
   * single-use: StrictMode's dev-only double-invoke would otherwise fire this twice and the
   * second call would race the first's token rotation and fail.
   */
  useEffect(() => {
    if (hasRestoredRef.current) return
    hasRestoredRef.current = true

    restoreSession()
      .then(setSession)
      .finally(() => setIsRestoring(false))
  }, [])

  const handleSignOut = async () => {
    setSession(null)
    await logout()
  }

  /** Drop the spent token so a refresh does not reopen the reset screen. */
  const goTo = (next: View) => {
    if (view.name === 'reset' && next.name !== 'reset') {
      window.history.replaceState(null, '', window.location.pathname)
    }
    setView(next)
  }

  if (isRestoring) {
    return null
  }

  if (session) {
    return <RoleHome user={session.user} onSignOut={handleSignOut} />
  }

  if (view.name === 'reset') {
    return (
      <ResetPasswordPage
        token={view.token}
        onSignIn={() => goTo({ name: 'login' })}
        onRequestNewLink={() => goTo({ name: 'forgot' })}
      />
    )
  }

  if (view.name === 'forgot') {
    return <ForgotPasswordPage onBackToSignIn={() => goTo({ name: 'login' })} />
  }

  return (
    <LoginPage onSignedIn={setSession} onForgotPassword={() => goTo({ name: 'forgot' })} />
  )
}

export default App
