import type { Ref } from 'vue'
import type { MfaCacheState } from '@/types/mfa'

export function useMfaStatus(): Ref<MfaCacheState> {
  return useState<MfaCacheState>('mfa-status', () => ({
    currentLevel: null,
    nextLevel: null,
    fetchedAt: 0,
  }))
}
