import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'

// Keep these values in sync with app/assets/breakpoints.scss
export const BREAKPOINTS = {
  xs: 480,
  sm: 768,
  md: 1024,
  lg: 1280,
  xl: 1440,
} as const

type BreakpointKey = keyof typeof BREAKPOINTS

type BreakpointQuery = `<${BreakpointKey}` | `>=${BreakpointKey}`

function createMediaQuery(query: string) {
  return useMediaQuery(query)
}

export function useBreakpoint(query: BreakpointQuery) {
  const operator = query.startsWith('>=') ? '>=' : '<'
  const key = query.replace(/^[<>]=?/, '') as BreakpointKey
  const value = BREAKPOINTS[key]

  if (!value)
    throw new Error(`[useBreakpoint] Unknown breakpoint key: ${key}`)

  const mq = operator === '>='
    ? createMediaQuery(`(min-width: ${value}px)`)
    : createMediaQuery(`(max-width: ${value - 1}px)`)

  return mq
}

export function useBreakpoints() {
  const queries = Object.keys(BREAKPOINTS).map(key => [key, BREAKPOINTS[key as BreakpointKey]] as const)

  const entries = queries.map(([key, value]) => {
    const current = createMediaQuery(`(min-width: ${value}px)`)
    return [key as BreakpointKey, current] as const
  })

  const booleans = Object.fromEntries(entries) as Record<BreakpointKey, ReturnType<typeof createMediaQuery>>

  const current = computed(() => {
    let active: BreakpointKey = 'xs'

    entries.forEach(([key]) => {
      const breakpointRef = booleans[key]
      if (breakpointRef?.value === true)
        active = key
    })

    return active
  })

  return {
    ...booleans,
    current,
  }
}
