import { useEffect, useRef, useState } from 'react'
import { AdminCreatePage } from './components/AdminCreatePage'
import { AdminDashboardPage } from './components/AdminDashboardPage'
import { AttendancePage } from './components/AttendancePage'
import { ClassesPage } from './components/ClassesPage'
import { ForgotPasswordPage } from './components/ForgotPasswordPage'
import { LoginPage } from './components/LoginPage'
import { MarkAttendancePage } from './components/MarkAttendancePage'
import { MyAttendancePage } from './components/MyAttendancePage'
import { MyTimetablePage } from './components/MyTimetablePage'
import { NoticeBoardPage } from './components/NoticeBoardPage'
import { ProfilePage } from './components/ProfilePage'
import { ResetPasswordPage } from './components/ResetPasswordPage'
import { RoleHome } from './components/RoleHome'
import { TimetablePage } from './components/TimetablePage'
import { logout, restoreSession, type AuthSession } from './lib/auth'
import { isAdminOnlyView, type View } from './lib/navigation'

/**
 * The emailed link points at /?token=…, so the token in the URL decides the
 * first screen. Swap this for a router once there are more routes.
 */
function initialView(): View {
  const token = new URLSearchParams(window.location.search).get('token')
  return token ? { name: 'reset', token } : { name: 'login' }
}

const HOME: View = { name: 'home' }

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
      .then((restored) => {
        if (restored) setView(HOME)
        setSession(restored)
      })
      .finally(() => setIsRestoring(false))
  }, [])

  const handleSignOut = async () => {
    setSession(null)
    setView(HOME)
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
    const isAdmin = session.user.role === 'admin'
    if (!isAdmin && isAdminOnlyView(view)) {
      return (
        <MyTimetablePage user={session.user} onBack={() => goTo(HOME)} onSignOut={handleSignOut} />
      )
    }

    if (view.name === 'profile') {
      return (
        <ProfilePage
          user={session.user}
          onBack={() => goTo({ name: 'home' })}
          onSignOut={handleSignOut}
          onProfileUpdated={(update) =>
            setSession({ ...session, user: { ...session.user, ...update } })
          }
        />
      )
    }

    if (view.name === 'admin-create') {
      return (
        <AdminCreatePage
          user={session.user}
          initialTab={view.tab}
          onBack={() => goTo({ name: 'home' })}
          onSignOut={handleSignOut}
        />
      )
    }

    if (view.name === 'admin-classes') {
      return (
        <ClassesPage user={session.user} onBack={() => goTo({ name: 'home' })} onSignOut={handleSignOut} />
      )
    }

    if (view.name === 'admin-timetable') {
      return (
        <TimetablePage user={session.user} onBack={() => goTo({ name: 'home' })} onSignOut={handleSignOut} />
      )
    }

    if (view.name === 'admin-attendance') {
      return (
        <AttendancePage user={session.user} onBack={() => goTo({ name: 'home' })} onSignOut={handleSignOut} />
      )
    }

    if (view.name === 'my-timetable') {
      return (
        <MyTimetablePage user={session.user} onBack={() => goTo({ name: 'home' })} onSignOut={handleSignOut} />
      )
    }

    if (view.name === 'mark-attendance') {
      return (
        <MarkAttendancePage user={session.user} onBack={() => goTo({ name: 'home' })} onSignOut={handleSignOut} />
      )
    }

    if (view.name === 'my-attendance') {
      return (
        <MyAttendancePage user={session.user} onBack={() => goTo({ name: 'home' })} onSignOut={handleSignOut} />
      )
    }

    if (view.name === 'notices') {
      return (
        <NoticeBoardPage user={session.user} onBack={() => goTo({ name: 'home' })} onSignOut={handleSignOut} />
      )
    }

    if (session.user.role === 'admin') {
      return (
        <AdminDashboardPage
          user={session.user}
          onOpenProfile={() => goTo({ name: 'profile' })}
          onOpenAdminCreate={(tab) => goTo({ name: 'admin-create', tab })}
          onOpenClasses={() => goTo({ name: 'admin-classes' })}
          onOpenTimetable={() => goTo({ name: 'admin-timetable' })}
          onOpenAttendance={() => goTo({ name: 'admin-attendance' })}
          onOpenNotices={() => goTo({ name: 'notices' })}
          onSignOut={handleSignOut}
        />
      )
    }

    return (
      <RoleHome
        user={session.user}
        onOpenProfile={() => goTo({ name: 'profile' })}
        onOpenMyTimetable={() => goTo({ name: 'my-timetable' })}
        onOpenMarkAttendance={() => goTo({ name: 'mark-attendance' })}
        onOpenMyAttendance={() => goTo({ name: 'my-attendance' })}
        onOpenNotices={() => goTo({ name: 'notices' })}
        onSignOut={handleSignOut}
      />
    )
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
    <LoginPage
      onSignedIn={(next) => {
        setView(HOME)
        setSession(next)
      }}
      onForgotPassword={() => goTo({ name: 'forgot' })} />
  )
}

export default App
