export interface PasswordRule {
  id: string
  label: string
  test: (value: string) => boolean
}

/** Shown as a live checklist under the new-password field. */
export const passwordRules: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (value) => value.length >= 8 },
  {
    id: 'case',
    label: 'Upper & lowercase letters',
    test: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value),
  },
  { id: 'number', label: 'At least one number', test: (value) => /\d/.test(value) },
  { id: 'symbol', label: 'At least one symbol', test: (value) => /[^A-Za-z0-9]/.test(value) },
]

export interface PasswordStrength {
  /** How many rules the password satisfies, 0 to passwordRules.length. */
  score: number
  label: string
  barColor: string
  textColor: string
}

const STRENGTH_STEPS: Omit<PasswordStrength, 'score'>[] = [
  { label: 'Too weak', barColor: 'bg-red-500', textColor: 'text-red-600' },
  { label: 'Weak', barColor: 'bg-red-500', textColor: 'text-red-600' },
  { label: 'Fair', barColor: 'bg-amber-500', textColor: 'text-amber-600' },
  { label: 'Good', barColor: 'bg-blue-500', textColor: 'text-blue-600' },
  { label: 'Strong', barColor: 'bg-emerald-500', textColor: 'text-emerald-600' },
]

export function scorePassword(value: string): PasswordStrength {
  const score = passwordRules.filter((rule) => rule.test(value)).length
  return { score, ...STRENGTH_STEPS[score] }
}

export function meetsPasswordRules(value: string): boolean {
  return passwordRules.every((rule) => rule.test(value))
}
