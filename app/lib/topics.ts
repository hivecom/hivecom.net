import type { Tables } from '@/types/database.types'
import { slugify } from './utils/formatting'

interface PathItem {
  parent_id: string
  title: string
}

/**
 * Generates an array of objects representing the path to a specific topic.
 */
export function composePathToTopic(parent_id: string | null, topics: Tables<'discussion_topics'>[]): PathItem[] {
  if (parent_id === null) {
    return []
  }

  const path: PathItem[] = []

  let currentParentId = parent_id as string | null
  const visited = new Set<string>()

  while (currentParentId !== null) {
    if (visited.has(currentParentId)) {
      break
    }

    visited.add(currentParentId)

    const parentTopic = topics.find(topic => topic.id === currentParentId)
    if (parentTopic) {
      path.unshift({ parent_id: parentTopic.id, title: parentTopic.name })
      currentParentId = parentTopic.parent_id
    }
    else {
      break
    }
  }

  return path
}

export function composedPathToString(path: PathItem[]): string {
  return `/${path.map(item => slugify(item.title)).join('/')}`
}
