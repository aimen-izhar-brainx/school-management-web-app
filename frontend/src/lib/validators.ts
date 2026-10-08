const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Shared email-format check, used by any form that collects an email address. */
export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim())
}
