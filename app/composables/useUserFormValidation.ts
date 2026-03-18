import type { Ref } from 'vue'
import type { Enums } from '@/types/database.types'
import { COUNTRY_SELECT_OPTIONS } from '@/lib/utils/country'
import { validateMarkdownNoHtml } from '@/lib/utils/sanitize'

type ProfileBadge = Enums<'profile_badge'>

// Minimal set of fields the validators actually read.
// Both UserForm and ProfileForm satisfy this shape structurally.
export interface ProfileFormState {
  username: string
  introduction: string
  markdown: string
  website: string
  country: string
  birthday: string
  public: boolean
}

// Full admin user form state - superset of ProfileFormState
export interface UserFormState extends ProfileFormState {
  supporter_patreon: boolean
  supporter_lifetime: boolean
  patreon_id: string
  discord_id: string
  steam_id: string
  badges: ProfileBadge[]
}

export interface ValidationResult {
  valid: boolean
  error: string | null
}

// Regex constants - module-scoped to avoid re-compilation
const WORD_ONLY_RE = /^\w+$/
const WHITESPACE_RE = /\s/
const DIGITS_ONLY_RE = /^\d+$/
const DISCORD_ID_RE = /^\d{17,19}$/
const STEAM_ID_RE = /^\d{17}$/
const HTTP_PROTOCOL_RE = /^https?:\/\//
const BIRTHDAY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Field limits (matching database constraints)
export const USERNAME_LIMIT = 32
export const INTRODUCTION_LIMIT = 128
export const MARKDOWN_LIMIT = 8128
export const BIRTHDAY_MIN_VALUE = '1900-01-01' as const

export function normalizeWebsiteUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed)
    return trimmed

  if (!HTTP_PROTOCOL_RE.test(trimmed))
    return `https://${trimmed}`

  return trimmed
}

export interface UseUserFormValidationOptions {
  // Optional server-side error to surface in username validation (e.g. duplicate username)
  submissionError?: Ref<string | null | undefined>
}

export function useUserFormValidation(
  userForm: Ref<ProfileFormState>,
  options: UseUserFormValidationOptions = {},
) {
  const usernameValidation = computed<ValidationResult>(() => {
    const username = userForm.value.username.trim()

    if (!username)
      return { valid: false, error: 'Username is required' }

    if (username.length > USERNAME_LIMIT)
      return { valid: false, error: `Username must be ${USERNAME_LIMIT} characters or less` }

    if (!WORD_ONLY_RE.test(username))
      return { valid: false, error: 'Username can only contain letters, numbers, and underscores' }

    if (WHITESPACE_RE.test(username))
      return { valid: false, error: 'Username cannot contain spaces' }

    const submissionError = options.submissionError?.value
    if (submissionError != null && submissionError.toLowerCase().includes('username'))
      return { valid: false, error: submissionError }

    return { valid: true, error: null }
  })

  const introductionValidation = computed<ValidationResult>(() => {
    const introduction = userForm.value.introduction.trim()

    if (introduction.length > INTRODUCTION_LIMIT)
      return { valid: false, error: `Introduction must be ${INTRODUCTION_LIMIT} characters or less` }

    return validateMarkdownNoHtml(introduction)
  })

  const markdownValidation = computed<ValidationResult>(() => {
    const markdown = userForm.value.markdown.trim()

    if (markdown.length > MARKDOWN_LIMIT)
      return { valid: false, error: `Content must be ${MARKDOWN_LIMIT} characters or less` }

    return validateMarkdownNoHtml(markdown)
  })

  const websiteValidation = computed<ValidationResult>(() => {
    const website = userForm.value.website.trim()
    if (!website)
      return { valid: true, error: null }

    const normalizedUrl = HTTP_PROTOCOL_RE.test(website) ? website : `https://${website}`

    try {
      const url = new URL(normalizedUrl)
      if (!['http:', 'https:'].includes(url.protocol))
        return { valid: false, error: 'Website must be a valid HTTP or HTTPS URL' }

      return { valid: true, error: null }
    }
    catch {
      return { valid: false, error: 'Please enter a valid website URL' }
    }
  })

  const countryValidation = computed<ValidationResult>(() => {
    const country = userForm.value.country.trim()
    if (!country)
      return { valid: true, error: null }

    const normalized = country.toUpperCase()
    if (!COUNTRY_SELECT_OPTIONS.some(option => option.value === normalized))
      return { valid: false, error: 'Please select a valid country' }

    return { valid: true, error: null }
  })

  const birthdayValidation = computed<ValidationResult>(() => {
    const birthday = userForm.value.birthday.trim()
    if (!birthday)
      return { valid: true, error: null }

    if (!BIRTHDAY_DATE_RE.test(birthday))
      return { valid: false, error: 'Please enter a valid date (YYYY-MM-DD)' }

    const parsed = new Date(birthday)
    if (Number.isNaN(parsed.getTime()))
      return { valid: false, error: 'Please enter a valid date' }

    if (parsed > new Date())
      return { valid: false, error: 'Birthday cannot be in the future' }

    if (birthday < BIRTHDAY_MIN_VALUE)
      return { valid: false, error: `Birthday cannot be before ${BIRTHDAY_MIN_VALUE}` }

    return { valid: true, error: null }
  })

  // ID validators - only meaningful for UserForm, returned unconditionally so callers
  // can destructure them without conditional logic. They pass vacuously when the form
  // field is absent (ProfileFormState doesn't have these, but the computed reads
  // via optional chaining so it resolves to empty string -> valid).
  const patreonIdValidation = computed<ValidationResult>(() => {
    const id = ((userForm.value as Partial<UserFormState>).patreon_id ?? '').trim()
    if (!id)
      return { valid: true, error: null }

    if (!DIGITS_ONLY_RE.test(id))
      return { valid: false, error: 'Patreon ID must be numeric' }

    return { valid: true, error: null }
  })

  const discordIdValidation = computed<ValidationResult>(() => {
    const id = ((userForm.value as Partial<UserFormState>).discord_id ?? '').trim()
    if (!id)
      return { valid: true, error: null }

    if (!DISCORD_ID_RE.test(id))
      return { valid: false, error: 'Discord ID must be 17-19 digits' }

    return { valid: true, error: null }
  })

  const steamIdValidation = computed<ValidationResult>(() => {
    const id = ((userForm.value as Partial<UserFormState>).steam_id ?? '').trim()
    if (!id)
      return { valid: true, error: null }

    if (!STEAM_ID_RE.test(id))
      return { valid: false, error: 'Steam ID must be 17 digits' }

    return { valid: true, error: null }
  })

  // Base validation covering the fields shared by both forms
  const baseValidation = computed(() => ({
    username: usernameValidation.value.valid,
    introduction: introductionValidation.value.valid,
    markdown: markdownValidation.value.valid,
    website: websiteValidation.value.valid,
    country: countryValidation.value.valid,
    birthday: birthdayValidation.value.valid,
  }))

  // Full validation including ID fields - use this in UserForm
  const validation = computed(() => ({
    ...baseValidation.value,
    patreon_id: patreonIdValidation.value.valid,
    discord_id: discordIdValidation.value.valid,
    steam_id: steamIdValidation.value.valid,
  }))

  const isValid = computed(() => Object.values(baseValidation.value).every(Boolean)
    && patreonIdValidation.value.valid
    && discordIdValidation.value.valid
    && steamIdValidation.value.valid,
  )

  return {
    usernameValidation,
    introductionValidation,
    markdownValidation,
    websiteValidation,
    countryValidation,
    birthdayValidation,
    patreonIdValidation,
    discordIdValidation,
    steamIdValidation,
    baseValidation,
    validation,
    isValid,
  }
}
