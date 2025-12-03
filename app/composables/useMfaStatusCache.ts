import type { Ref } from 'vue'
import type { MfaCacheState } from '@/types/mfa'

export function useMfaStatusCache(): Ref<MfaCacheState> {
  return useState<MfaCacheState>('mfa-status', () => ({
    currentLevel: null,
    nextLevel: null,
    fetchedAt: 0,
  }))
}
