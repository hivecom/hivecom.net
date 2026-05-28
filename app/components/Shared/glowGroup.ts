import type { InjectionKey } from 'vue'

export interface GlowCardHandle {
  setPosition: (x: number, y: number) => void
  clearPosition: () => void
  activate: () => void
  deactivate: () => void
  getEl: () => HTMLElement | null | undefined
}

export interface GlowGroupContext {
  register: (card: GlowCardHandle) => void
  unregister: (card: GlowCardHandle) => void
}

export const glowGroupKey: InjectionKey<GlowGroupContext> = Symbol('glow-group')
