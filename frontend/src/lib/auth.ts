import type { RoleId } from '../data/roles'
import { api, ApiError, setAccessToken } from './http'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: RoleId
}

export interface AuthSession {
  token: string
  user: AuthUser
}

export interface LoginCredentials {
  email: string
  password: string
  rememberMe?: boolean
}

export class LoginError extends Error {}

export class PasswordResetError extends Error {}

/** The server decides the role — the client only sends credentials. */
export async function login({ email, password, rememberMe }: LoginCredentials): Promise<AuthSession> {
  try {
    const session = await api.post<AuthSession>('/auth/login', { email, password, rememberMe })
    setAccessToken(session.token)
    return session
  } catch (cause) {
    throw new LoginError(cause instanceof ApiError ? cause.message : 'Invalid email or password.')
  }
}

/** Restores a session from the httpOnly refresh cookie, e.g. on page load. Resolves to null if there is none. */
export async function restoreSession(): Promise<AuthSession | null> {
  try {
    const session = await api.post<AuthSession>('/auth/refresh')
    setAccessToken(session.token)
    return session
  } catch {
    setAccessToken(null)
    return null
  }
}

export async function logout(): Promise<void> {
  await api.post<void>('/auth/logout').catch(() => {})
  setAccessToken(null)
}

/**
 * Emails a reset link. Resolves even for unknown addresses — the response must
 * never reveal which emails have accounts.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!email.trim()) {
    throw new PasswordResetError('Please enter your email address.')
  }

  try {
    await api.post<{ success: true }>('/auth/forgot-password', { email })
  } catch (cause) {
    throw new PasswordResetError(
      cause instanceof ApiError ? cause.message : 'We could not send the link. Please try again.',
    )
  }
}

/**
 * Checks the token from the email link before the new-password form is shown,
 * so an expired link fails early instead of after the user types a password.
 */
export async function verifyResetToken(token: string): Promise<{ email: string }> {
  try {
    return await api.get<{ email: string }>(`/auth/reset-password/${encodeURIComponent(token)}`)
  } catch (cause) {
    throw new PasswordResetError(
      cause instanceof ApiError ? cause.message : 'This reset link is invalid.',
    )
  }
}

/** The server re-checks the token — it can expire while the form is open. */
export async function resetPassword({ token, password }: ResetPasswordInput): Promise<void> {
  try {
    await api.post<{ success: true }>('/auth/reset-password', { token, password })
  } catch (cause) {
    throw new PasswordResetError(
      cause instanceof ApiError ? cause.message : 'Something went wrong. Please try again.',
    )
  }
}

export interface ResetPasswordInput {
  token: string
  password: string
}

/** How long a reset link stays valid — shown to the user, mirrors the server. */
export const RESET_LINK_TTL_LABEL = '30 minutes'
