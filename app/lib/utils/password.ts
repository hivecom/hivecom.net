export interface PasswordRule {
  key: string
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    key: 'minLength',
    label: 'At least 16 characters',
    test: p => p.length >= 16,
  },
  {
    key: 'lowercase',
    label: 'At least one lowercase letter',
    test: p => /[a-z]/.test(p),
  },
  {
    key: 'uppercase',
    label: 'At least one uppercase letter',
    test: p => /[A-Z]/.test(p),
  },
  {
    key: 'digit',
    label: 'At least one digit',
    test: p => /\d/.test(p),
  },
  {
    key: 'symbol',
    label: 'At least one symbol',
    test: p => /[^a-z0-9]/i.test(p),
  },
]

export function validatePassword(password: string): string | null {
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(password))
      return rule.label
  }
  return null
}

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every(rule => rule.test(password))
}
