// Scan-pass uniform defaults. The GLSL lives in .glsl files next to the Vue
// component, so useGlobeRenderer can read these without reaching into it.

export interface ScanPassUniforms {
  strength: number

  /** Fraction of the screen per second. */
  speed: number

  /** Fraction of screen height. */
  bandWidth: number

  /** Second offset band, 1.0 on and 0.0 off. */
  doubleBand: number

  rippleSpeed: number

  /** Cycles. */
  rippleYFreq: number

  /** Cycles. */
  rippleXFreq: number

  /** Chromatic aberration spread in pixels. */
  chroma: number
}

export const SCAN_PASS_DEFAULTS: ScanPassUniforms = {
  strength: 0.008,
  speed: 0.05,
  bandWidth: 0.055,
  doubleBand: 1.0,
  rippleSpeed: 1.6,
  rippleYFreq: 300.0,
  rippleXFreq: 7.0,
  chroma: 18.0,
}

// For lower-performing devices.
export const SCAN_PASS_LOW_PERF: ScanPassUniforms = {
  strength: 0.006,
  speed: 0.05,
  bandWidth: 0.055,
  doubleBand: 0.0,
  rippleSpeed: 1.0,
  rippleYFreq: 150.0,
  rippleXFreq: 4.0,
  chroma: 8.0,
}
