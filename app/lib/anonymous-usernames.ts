import rawUsernames from '../../usernames.json'

interface UsernameDataset {
  attributes: string[]
  colors: string[]
  animals: string[]
}

const FALLBACK_DATASET: UsernameDataset = {
  attributes: ['Swift', 'Bright', 'Calm', 'Brave', 'Kind', 'Witty'],
  colors: ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'],
  animals: ['Panda', 'Fox', 'Otter', 'Eagle', 'Tiger', 'Dolphin'],
}

function isUuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value)
}

function normalizeList(list: unknown): string[] {
  if (!Array.isArray(list)) {
    return []
  }

  return list
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
}

function resolveDataset(): UsernameDataset {
  const data = rawUsernames as Partial<UsernameDataset> | undefined

  const attributes = normalizeList(data?.attributes)
  const colors = normalizeList(data?.colors)
  const animals = normalizeList(data?.animals)

  return {
    attributes: attributes.length ? attributes : FALLBACK_DATASET.attributes,
    colors: colors.length ? colors : FALLBACK_DATASET.colors,
    animals: animals.length ? animals : FALLBACK_DATASET.animals,
  }
}

function hashSeed(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return hash
}

function pick(list: string[], hash: number) {
  if (!list.length) {
    return ''
  }

  return list[hash % list.length] ?? ''
}

function sanitizePart(value: string) {
  return value.replace(/\W/g, '')
}

export function getAnonymousUsername(uuid: string) {
  if (!isUuid(uuid)) {
    return 'AnonymousUser'
  }

  const dataset = resolveDataset()
  const hash = hashSeed(uuid.toLowerCase())

  const attribute = sanitizePart(pick(dataset.attributes, hash))
  const color = sanitizePart(pick(dataset.colors, hash >>> 8))
  const animal = sanitizePart(pick(dataset.animals, hash >>> 16))

  const combined = `${attribute}${color}${animal}`

  return combined || 'AnonymousUser'
}
