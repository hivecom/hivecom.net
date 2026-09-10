import type { InjectionKey } from 'vue'

export interface FocusTargetHandle {
  getEl: () => HTMLElement | null | undefined
  // Per-target overrides for how far the brackets sit outside the box.
  // Negative values pull them inside. Undefined falls back to the frame's own.
  getPadding: () => number | undefined
  getPaddingTop: () => number | undefined
}

export interface FocusFrameContext {
  register: (target: FocusTargetHandle) => void
  unregister: (target: FocusTargetHandle) => void
  notifyEnter: (target: FocusTargetHandle) => void
  notifyLeave: (target: FocusTargetHandle) => void
}

export const focusFrameKey: InjectionKey<FocusFrameContext> = Symbol('focus-frame')
