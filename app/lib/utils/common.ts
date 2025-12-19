export function noop() {
  // Do nothing
}

export function clamp(min: number, value: number, max: number) {
  return Math.max(Math.min(value, max), min)
}
