import { computed } from 'vue'

export function useCanonicalUrl() {
  const route = useRoute()
  const runtimeConfig = useRuntimeConfig()

  return computed(() => {
    const baseUrl = runtimeConfig.public.baseUrl || 'https://hivecom.net'
    return new URL(route.path, baseUrl).toString()
  })
}
