import type { Tables } from '@/types/database.overrides'
import { slugify } from './utils/formatting'

interface PathItem {
  parent_id: string
  title: string
  is_archived: boolean
}

export interface FlatTopicEntry {
  topic: Tables<'discussion_topics'>
  depth: number
  path: string
}

/**
 * Must match the forum page's sortTopicsByPriority. Nonzero priority first,
 * descending, then the rest alphabetically.
 */
function sortByPriority(
  a: Tables<'discussion_topics'>,
  b: Tables<'discussion_topics'>,
): number {
  const aHas = a.priority !== 0
  const bHas = b.priority !== 0

  if (aHas && bHas) {
    if (a.priority === b.priority)
      return a.name.localeCompare(b.name)

    return b.priority - a.priority
  }

  if (aHas && !bHas)
    return -1
  if (!aHas && bHas)
    return 1

  return a.name.localeCompare(b.name)
}

/**
 * Depth-first, with `depth` 0 at the top level and `path` like
 * "/games/overwatch". `excludedIds` is e.g. a topic and its descendants while
 * editing it.
 */
export function flattenTopicsTree(
  topics: Tables<'discussion_topics'>[],
  excludedIds: Set<string> = new Set(),
): FlatTopicEntry[] {
  const result: FlatTopicEntry[] = []

  function visit(parentId: string | null, depth: number, pathPrefix: string): void {
    const children = topics
      .filter(t => t.parent_id === parentId && !excludedIds.has(t.id))
      .sort(sortByPriority)

    for (const child of children) {
      const path = `${pathPrefix}/${slugify(child.name)}`
      result.push({ topic: child, depth, path })
      visit(child.id, depth + 1, path)
    }
  }

  visit(null, 0, '')
  return result
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
      path.unshift({ parent_id: parentTopic.id, title: parentTopic.name, is_archived: parentTopic.is_archived ?? false })
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
