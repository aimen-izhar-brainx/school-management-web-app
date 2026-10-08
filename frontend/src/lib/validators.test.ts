import { describe, expect, it } from 'vitest'
import { isValidEmail } from './validators'

// Tests for T-005: shared email validator, extracted from the duplicated
// `EMAIL_PATTERN` in `AdminCreatePage.tsx` and the inline regex in
// `ProfilePage.tsx`'s `handleSaveInfo`.
//
// `./validators` does not exist yet, so this whole file is expected to fail
// to resolve the import until `frontend/src/lib/validators.ts` is built.
//
// Assumed API: `isValidEmail(email: string): boolean` — a plain function
// (following the `lib/password.ts` convention), trimming before validating
// so callers get the current `.trim()` behavior for free.
describe('isValidEmail', () => {
  it('AC-02.4 returns true for a syntactically valid email', () => {
    expect(isValidEmail('name@example.com')).toBe(true)
  })

  it('baseline: returns false for a clearly invalid email ("bob@")', () => {
    expect(isValidEmail('bob@')).toBe(false)
  })

  it('UC-02-E1 trims leading/trailing whitespace before validating and accepts the result', () => {
    expect(isValidEmail('  name@example.com  ')).toBe(true)
    expect(isValidEmail('\tname@example.com\n')).toBe(true)
  })

  it('UC-02-E2 returns false for an empty string', () => {
    expect(isValidEmail('')).toBe(false)
  })

  it('UC-02-E2 returns false for a whitespace-only string (empty after trim)', () => {
    expect(isValidEmail('   ')).toBe(false)
  })

  it('UC-02-E3 accepts an extremely long (300+ char) but syntactically valid email without crashing or truncating', () => {
    // 290 'a' characters + "@example.com" = 302 chars, well past the 300
    // threshold called out in the ticket.
    const longLocalPart = 'a'.repeat(290)
    const longEmail = `${longLocalPart}@example.com`
    expect(longEmail.length).toBeGreaterThan(300)

    expect(() => isValidEmail(longEmail)).not.toThrow()
    expect(isValidEmail(longEmail)).toBe(true)
  })
})
