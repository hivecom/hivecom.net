// Sourced from hive-friends codebase which sourced it from who knows where
export function randomSeed(seed: string) {
  function alphabetPosition(text: string) {
    let result = ''
    for (let i = 0; i < text.length; i++) {
      const code = text.toUpperCase().charCodeAt(i)
      if (code > 64 && code < 91)
        result += code - 64
    }
    return Number(result.slice(0, result.length - 1))
  }
  let a = alphabetPosition(seed)
  let t = a += 0x6D2B79F5
  t = Math.imul(t ^ t >>> 15, t | 1)
  t ^= t + Math.imul(t ^ t >>> 7, t | 61)
  return ((t ^ t >>> 14) >>> 0) / 4294967296
}

export function seedRndMinMax(min: number, max: number, seed: string) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(randomSeed(seed) * (max - min + 1)) + min
}

/**
 * Returns a new array with elements in a random order using the Fisher-Yates shuffle.
 * Does not mutate the original array.
 */
export function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = result[i] as T
    result[i] = result[j] as T
    result[j] = temp
  }
  return result
}
