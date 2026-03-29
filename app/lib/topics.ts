import type { Tables } from '@/types/database.overrides'
import { slugify } from './utils/formatting'

interface PathItem {
  parent_id: string
  title: string
}

export interface FlatTopicEntry {
  topic: Tables<'discussion_topics'>
  depth: number
  path: string
}

/**
 * Sort comparator matching the forum page's sortTopicsByPriority:
 *   - Topics with priority !== 0 first, sorted by priority descending
 *   - Topics with priority === 0 fall to the bottom, sorted alphabetically
 *   - Ties broken alphabetically by name
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
 * Returns a flat list of topics in depth-first tree order where siblings at
 * every level are sorted by the same priority logic used by the forum page.
 * Each entry carries the topic, its nesting depth (0 = top-level), and its
 * slug path string (e.g. "/games/overwatch") for display.
 *
 * @param topics    Full flat topic list from the database
 * @param excludedIds  Topic IDs to omit from the result (e.g. self + descendants when editing)
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
