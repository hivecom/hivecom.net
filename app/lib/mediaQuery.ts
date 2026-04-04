import { useMediaQuery } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'

const BREAKPOINT_OPERATOR_RE = /^[<>]=?/

// Keep these values in sync with app/assets/breakpoints.scss
export const BREAKPOINTS = {
  xs: 480,
  s: 768,
  m: 1024,
  l: 1280,
  xl: 1440,
} as const

type BreakpointKey = keyof typeof BREAKPOINTS

type BreakpointQuery = `<${BreakpointKey}` | `>=${BreakpointKey}`

// useMediaQuery returns `false` during SSR, which causes hydration mismatches
// when components conditionally render based on breakpoints. By gating the
// real media query result behind a mounted flag we ensure the SSR and initial
// client render both produce the same output (always-false), and the correct
// value is only applied after the client has mounted and evaluated the query.
function createMediaQuery(query: string) {
  const mq = useMediaQuery(query)
  const mounted = ref(false)
  onMounted(() => {
    mounted.value = true
  })
  return computed(() => mounted.value && mq.value)
}

export function useBreakpoint(query: BreakpointQuery) {
  const operator = query.startsWith('>=') ? '>=' : '<'
  const key = query.replace(BREAKPOINT_OPERATOR_RE, '') as BreakpointKey
  const value = BREAKPOINTS[key]

  if (!value)
    throw new Error(`[useBreakpoint] Unknown breakpoint key: ${key}`)

  return operator === '>='
    ? createMediaQuery(`(min-width: ${value}px)`)
    : createMediaQuery(`(max-width: ${value - 1}px)`)
}

// REVIEW (@dolanske) Renamed because it clashes with vueuse export (at least what
// I think, becasue VSCOde refused to hint me an import to this). Not sure I was
// using it wrong, but it always returned true for everything. Maybe we could
// add tests for util functions?
export function useActiveBreakpoints() {
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
