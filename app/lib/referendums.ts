import type { Tables } from '@/types/database.overrides'

export type ReferendumStatus = 'active' | 'upcoming' | 'concluded'

export type ReferendumStatusVariant = 'success' | 'warning' | 'neutral'

export function getReferendumStatus(referendum: { date_start: string, date_end: string }): ReferendumStatus {
  const now = new Date()
  const start = new Date(referendum.date_start)
  const end = new Date(referendum.date_end)

  if (now < start)
    return 'upcoming'
  if (now > end)
    return 'concluded'

  return 'active'
}

export function getVoteCount(referendum: { vote_count?: Array<{ count: number }> }): number {
  return referendum.vote_count?.[0]?.count ?? 0
}

export function getReferendumStatusVariant(status: ReferendumStatus): ReferendumStatusVariant {
  switch (status) {
    case 'active':
      return 'success'

    case 'upcoming':
      return 'warning'

    case 'concluded':
      return 'neutral'
  }
}

export interface ReferendumFormState {
  title: string
  description: string
  date_start: Date | null
  date_end: Date | null
  multiple_choice: boolean
  is_public: boolean
  choices: string[]
}

export interface ReferendumFormValidation {
  title: boolean
  date_start: boolean
  date_end: boolean
  choices: boolean
  dateRange: boolean
  startBeforeEnd: boolean
}

export function emptyReferendumForm(): ReferendumFormState {
  return {
    title: '',
    description: '',
    date_start: new Date(),
    date_end: null,
    multiple_choice: false,
    is_public: false,
    choices: [],
  }
}

export function referendumFormFromRow(referendum: Tables<'referendums'>): ReferendumFormState {
  return {
    title: referendum.title,
    description: referendum.description ?? '',
    date_start: referendum.date_start ? new Date(referendum.date_start) : new Date(),
    date_end: referendum.date_end ? new Date(referendum.date_end) : null,
    multiple_choice: referendum.multiple_choice,
    is_public: referendum.is_public,
    choices: [...referendum.choices],
  }
}

export function validateReferendumForm(form: ReferendumFormState): ReferendumFormValidation {
  const { date_start, date_end } = form

  return {
    title: !!form.title.trim(),
    date_start: !!date_start,
    date_end: !!date_end,
    choices: form.choices.length >= 2,
    dateRange: date_end != null ? date_end > new Date() : false,
    startBeforeEnd: date_start != null && date_end != null ? date_end > date_start : true,
  }
}

// Null while either date is missing, which validation already blocks.
export function referendumFormPayload(form: ReferendumFormState) {
  const dateStart = form.date_start?.toISOString()
  const dateEnd = form.date_end?.toISOString()

  if (!dateStart || !dateEnd)
    return null

  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    date_start: dateStart,
    date_end: dateEnd,
    multiple_choice: form.multiple_choice,
    is_public: form.is_public,
    choices: form.choices,
  }
}
