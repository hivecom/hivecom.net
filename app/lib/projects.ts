import type { Tables } from '@/types/database.overrides'

export interface ProjectFormState {
  title: string
  description: string
  markdown: string
  link: string
  owner: string | null
  tags: string[]
  github: string
}

export interface ProjectFormValidation {
  title: boolean
  markdown: boolean
  github: boolean
}

// GitHub repository in username/repository form
const GITHUB_REPO_REGEX = /^\w[\w.-]*\/\w[\w.-]*$/

export function emptyProjectForm(): ProjectFormState {
  return {
    title: '',
    description: '',
    markdown: '',
    link: '',
    owner: null,
    tags: [],
    github: '',
  }
}

export function projectFormFromRow(project: Tables<'projects'>): ProjectFormState {
  return {
    title: project.title,
    description: project.description ?? '',
    markdown: project.markdown,
    link: project.link ?? '',
    owner: project.owner,
    tags: project.tags ?? [],
    github: project.github ?? '',
  }
}

export function validateProjectForm(form: ProjectFormState): ProjectFormValidation {
  const github = form.github.trim()

  return {
    title: !!form.title.trim(),
    markdown: !!form.markdown.trim(),
    github: !github || GITHUB_REPO_REGEX.test(github),
  }
}

export function projectFormPayload(form: ProjectFormState) {
  return {
    title: form.title,
    description: form.description || null,
    markdown: form.markdown,
    link: form.link || null,
    owner: form.owner,
    tags: form.tags.length > 0 ? form.tags : null,
    github: form.github.trim() || null,
  }
}
