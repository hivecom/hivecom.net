// Scan-pass shader uniform defaults.
// The actual GLSL source is imported from the .glsl files next to the Vue
// component; this module only owns the default values so that
// useGlobeRenderer can reference them without reaching into the component.

export interface ScanPassUniforms {
  /** Distortion intensity. */
  strength: number
  /** Band scroll speed (fraction of screen per second). */
  speed: number
  /** Fractional screen-height of the scan band. */
  bandWidth: number
  /** Enable a second offset band (1.0 = on, 0.0 = off). */
  doubleBand: number
  /** Speed of the liquid ripple inside the band. */
  rippleSpeed: number
  /** Vertical ripple frequency (cycles). */
  rippleYFreq: number
  /** Horizontal ripple frequency (cycles). */
  rippleXFreq: number
  /** Chromatic-aberration spread in pixels. */
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

/**
 * Reduced-quality preset for lower-performing devices.
 * Halves the chroma aberration, disables the second band, and lowers ripple
 * frequencies so the fragment shader does less work per pixel.
 */
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
