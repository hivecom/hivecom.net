// Procedural sun for the bottom of the landing page. It's a single fullscreen
// pass with no feedback buffer, one draw call a frame, so it stays cheap enough
// for ambient decoration.
//
// Three is loaded with a dynamic import so it never lands in the SSR bundle.

import type * as THREE from 'three'
import { curlNoiseChunk, fbmChunk } from '@/lib/gl/noise'

// 0..1 [r, g, b] triples from the VUI tokens. sunPalette needs bg to tell light
// from dark.
export interface SunColors {
  accent: [number, number, number]
  bg: [number, number, number]
}

type Rgb = [number, number, number]

interface SunPalette {
  limb: Rgb
  body: Rgb
  hot: Rgb
}

function rgbToHsl([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const span = max - min

  if (span === 0)
    return [0, 0, l]

  const s = l > 0.5 ? span / (2 - max - min) : span / (max + min)

  let h: number
  if (max === r)
    h = ((g - b) / span + (g < b ? 6 : 0)) / 6
  else if (max === g)
    h = ((b - r) / span + 2) / 6
  else
    h = ((r - g) / span + 4) / 6

  return [h, s, l]
}

function hslToRgb([h, s, l]: Rgb): Rgb {
  h = ((h % 1) + 1) % 1

  if (s === 0)
    return [l, l, l]

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  const channel = (t: number) => {
    t = ((t % 1) + 1) % 1
    if (t < 1 / 6)
      return p + (q - p) * 6 * t
    if (t < 1 / 2)
      return q
    if (t < 2 / 3)
      return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)]
}

// The limb keeps the accent hue and only loses value. A blackbody roll toward
// red turns the rim into an orange outline around a green sun, so the hue shift
// lives in the core.
//
// On the light page nothing out-brightens the background, so the core carries
// heat through saturation. A white core would read as a hole. On the dark page
// it goes lighter but stops short of white, which blows out the rim and plumes.
export function sunPalette(colors: SunColors): SunPalette {
  const [h, s, l] = rgbToHsl(colors.accent)
  const bgLum = 0.299 * colors.bg[0] + 0.587 * colors.bg[1] + 0.114 * colors.bg[2]
  const light = bgLum > 0.5

  return {
    // On the light page the limb can't go dark, or the thin plasma riding the
    // same colour composites into grey soot.
    limb: hslToRgb([h, Math.min(1, light ? s * 1.4 + 0.1 : s * 1.05), Math.max(0.08, l * (light ? 0.7 : 0.58))]),
    body: hslToRgb([h, light ? Math.min(1, s * 1.5 + 0.1) : s, light ? Math.min(0.6, l * 1.2) : l]),
    hot: light
      ? hslToRgb([h - 0.06, Math.min(1, s * 1.6 + 0.3), 0.62])
      : hslToRgb([h - 0.05, Math.min(1, s * 0.7), 0.8]),
  }
}

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const SUN_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uRise;
  uniform float uAspect;
  uniform vec3 uBody;
  uniform vec3 uHot;
  uniform vec3 uLimb;
  varying vec2 vUv;

  ${curlNoiseChunk}
  ${fbmChunk}

  const float PI = 3.14159265;

  void main() {
    // R is in canvas heights, so only the top of the curve crests the page.
    float R = 4.0;
    vec2 center = vec2(0.5, mix(-4.2, -3.55, uRise));
    // x in canvas heights too, so the arc keeps its shape at any width.
    vec2 p = vec2((vUv.x - center.x) * uAspect, vUv.y - center.y);

    float r = length(p);
    float ang = atan(p.y, p.x);
    float d = r - R; // signed distance from the limb, negative inside the body

    // Only a thin band either side of straight up is on screen. Measuring from
    // there keeps edge detail at a usable frequency.
    float arc = ang - PI * 0.5;

    // Shallow on purpose. Stacking finer octaves here turns the disc to noise.
    vec2 flow = curl(p * 2.2 + uTime * 0.04) * 0.25;
    float churn = smoothstep(0.3, 0.64, fbm(p * 2.6 + flow + uTime * 0.03));
    float mottle = (churn - 0.5) * 0.22;

    float disc = 1.0 - smoothstep(-0.025, 0.025, d);

    // Brightens toward the limb. Without the narrow ring the disc meets its own
    // corona at a dark seam.
    float depth = clamp(-d / 0.75, 0.0, 1.0);
    float sphere = 1.0 - smoothstep(0.0, 0.85, depth);
    float ring = 1.0 - smoothstep(0.0, 0.16, depth);
    float lum = 0.44 + 0.2 * sphere + 0.38 * ring + mottle;

    // Polar space: noise stretched outward turns blobs into streaks, and the curl
    // warp drags them sideways so they wisp. span fades 4x faster inward, which
    // keeps a plume rooted on the edge instead of buried in the disc.
    float span = d < 0.0 ? -d * 4.0 : d;
    vec2 polar = vec2(arc * 26.0, span * 6.0 - uTime * 0.22);
    vec2 swirl = curl(polar * 0.5 + uTime * 0.06) * 1.2;
    float wisp = fbm(polar + swirl);
    // Squared so most of the band stays empty instead of an even haze.
    wisp *= wisp;

    float corona = exp(-span * 16.0) * (0.2 + 0.9 * wisp);

    // Four burst slots, each on its own clock. The exponential falloff over reach
    // lets a plume thin out instead of ending at a line.
    float lick = fbm(vec2(arc * 13.0, uTime * 0.15));
    float reach = 0.018 + 0.05 * lick;

    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float period = 9.0 + 5.0 * vnHash(vec2(fi, 2.0));
      float clock = uTime / period + vnHash(vec2(fi, 5.0));
      float shot = floor(clock); // which firing this is, so each gets its own spot
      float phase = fract(clock);

      // Up fast, down slow.
      float env = smoothstep(0.0, 0.12, phase) * (1.0 - smoothstep(0.12, 0.8, phase));

      float at = (vnHash(vec2(shot, fi + 11.0)) - 0.5) * 0.62;
      float width = 0.03 + 0.06 * vnHash(vec2(shot, fi + 23.0));
      float off = (arc - at) / width;
      reach += env * exp(-off * off) * (0.09 + 0.16 * vnHash(vec2(shot, fi + 37.0)));
    }

    float prom = exp(-span / max(reach, 0.004)) * wisp * 1.6;

    // Not masked against the disc. The plasma is a layer that carries across the limb.
    float cover = clamp(corona * 0.55 + prom, 0.0, 1.0);
    // Fade before the canvas top, since a plume sliced off there reads as a bug.
    cover *= smoothstep(1.0, 0.84, vUv.y);

    // lum tops out around 0.96 at the limb, so the ramp has to finish below
    // that or the whole disc comes out flat green.
    vec3 surface = mix(uLimb, uBody, smoothstep(0.05, 0.55, lum));
    surface = mix(surface, uHot, smoothstep(0.62, 1.0, lum));

    // Reaches the body colour early. Coverage already thins the plasma through
    // alpha, and darkening the colour too looks like soot on the light page.
    vec3 plasma = mix(uLimb, uBody, smoothstep(0.02, 0.25, cover));
    plasma = mix(plasma, uHot, smoothstep(0.35, 0.85, cover));

    // Composite over the disc rather than cross-fading by the disc mask, which
    // leaves a half-mixed band along the edge and clips plumes crossing it.
    float alpha = cover + disc * (1.0 - cover);
    vec3 col = plasma * cover + surface * disc * (1.0 - cover);

    // Already premultiplied, which is what the renderer expects.
    gl_FragColor = vec4(col, alpha);
  }
`

// A soft glow gains nothing from extra pixels.
const MAX_PIXEL_RATIO = 1.5

export class SunField {
  private readonly THREE: typeof THREE
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly cam: THREE.OrthographicCamera
  private readonly mat: THREE.ShaderMaterial

  // Smoothed so scroll jitter doesn't jump the sun.
  private rise = 0
  private riseTarget = 0

  // resize runs every frame. Three's setSize writes canvas.width/height, and
  // assigning those resets the drawing buffer even at the same value.
  private bufWidth = 0
  private bufHeight = 0

  private disposed = false

  private constructor(t: typeof THREE, canvas: HTMLCanvasElement, colors: SunColors) {
    this.THREE = t

    // A fullscreen quad has no edges for MSAA to smooth.
    const renderer = new t.WebGLRenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      powerPreference: 'low-power',
    })
    renderer.setClearColor(new t.Color(0, 0, 0), 0)
    this.renderer = renderer

    this.scene = new t.Scene()
    this.cam = new t.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this.mat = new t.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: SUN_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uRise: { value: 0 },
        uAspect: { value: 1 },
        uBody: { value: new t.Vector3() },
        uHot: { value: new t.Vector3() },
        uLimb: { value: new t.Vector3() },
      },
    })
    this.setColors(colors)
    this.scene.add(new t.Mesh(new t.PlaneGeometry(2, 2), this.mat))
  }

  // Null when WebGL isn't available.
  static async create(canvas: HTMLCanvasElement, colors: SunColors): Promise<SunField | null> {
    try {
      const t = await import('three')
      const probe = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
      if (!probe)
        return null
      return new SunField(t, canvas, colors)
    }
    catch {
      return null
    }
  }

  setColors(colors: SunColors) {
    if (this.disposed)
      return

    const { limb, body, hot } = sunPalette(colors)
    ;(this.mat.uniforms.uLimb!.value as THREE.Vector3).set(limb[0], limb[1], limb[2])
    ;(this.mat.uniforms.uBody!.value as THREE.Vector3).set(body[0], body[1], body[2])
    ;(this.mat.uniforms.uHot!.value as THREE.Vector3).set(hot[0], hot[1], hot[2])
  }

  // 0 is below the fold, 1 is fully risen.
  setRise(target: number) {
    this.riseTarget = Math.max(0, Math.min(1, target))
  }

  resize(width: number, height: number, dpr: number) {
    if (this.disposed || width <= 0 || height <= 0)
      return
    const pr = Math.min(dpr, MAX_PIXEL_RATIO)
    const bw = Math.max(1, Math.round(width * pr))
    const bh = Math.max(1, Math.round(height * pr))
    if (bw === this.bufWidth && bh === this.bufHeight)
      return
    this.bufWidth = bw
    this.bufHeight = bh
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(bw, bh, false)
    this.mat.uniforms.uAspect!.value = width / height
  }

  // `time` is a monotonic clock in seconds.
  frame(dt: number, time: number) {
    if (this.disposed)
      return
    const step = Math.min(dt, 0.05)
    this.rise += (this.riseTarget - this.rise) * Math.min(1, step * 4)
    this.mat.uniforms.uRise!.value = this.rise
    this.mat.uniforms.uTime!.value = time
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.cam)
  }

  dispose() {
    if (this.disposed)
      return
    this.disposed = true
    ;(this.scene.children[0] as THREE.Mesh).geometry.dispose()
    this.mat.dispose()
    this.renderer.dispose()
  }
}
