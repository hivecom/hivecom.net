import type { InjectionKey } from 'vue'

export interface CornerCardHandle {
  getEl: () => HTMLElement | null | undefined
}

export interface CornerGroupContext {
  register: (card: CornerCardHandle) => void
  unregister: (card: CornerCardHandle) => void
  notifyEnter: (card: CornerCardHandle) => void
}

export const cornerGroupKey: InjectionKey<CornerGroupContext> = Symbol('corner-group')
