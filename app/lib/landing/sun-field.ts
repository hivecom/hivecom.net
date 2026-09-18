// A procedural sun for the bottom of the landing page. Single-pass: one
// fullscreen quad with a shader that draws a glowing disc, a churning
// photosphere, and a flickering corona. It borrows the turbulence math from the
// smoke field (curl-noise flow + value-noise fbm, shared via lib/gl/noise) but
// skips the ping-pong feedback buffer the smoke field uses, so it's one draw
// call a frame instead of several. That keeps it cheap enough to run as ambient
// background decoration, which matters because it only wakes up when the user
// scrolls the sun into view.
//
// Three is pulled in with a dynamic import (the AdminGlobe / smoke-field
// convention) so it never lands in the SSR bundle.
//
// --- How to push this further, if we want more detail later ---
//  - Feedback pass: add the smoke field's two-render-target advect step so the
//    corona flares smear into wisping trails instead of resolving every frame.
//    ~3x the fill cost, but it's the single biggest upgrade to the "alive" look.
//  - Bloom: render the disc to a half-res target, blur it, add it back. Gives a
//    real light-bleed halo rather than the shader-faked falloff.
//  - Sphere: swap the flat disc for an actual sphere with rotating surface UVs,
//    so it reads as a body, not a decal.
//  - Sunspots: subtractive fbm stamps (like the smoke field's black cutouts)
//    carving darker granules into the photosphere.

import type * as THREE from 'three'
import { curlNoiseChunk, fbmChunk } from '@/lib/gl/noise'

// Theme colours as 0..1 [r, g, b] triples, read from the VUI tokens so the sun
// tracks light/dark. The background comes along because the palette below needs
// to know which side of the page it's burning against.
export interface SunColors {
  accent: [number, number, number]
  bg: [number, number, number]
}

type Rgb = [number, number, number]

// The three points the shader's temperature ramp runs through.
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

// Build the ramp the shader colours off: a fall from the core out to the limb,
// anchored on the accent hue. A real blackbody ramp would roll the limb toward
// red, but that turns the rim into an orange outline drawn around a green sun,
// so the limb keeps the accent hue and only loses value. The hue shift is left
// to the core, where it reads as heat rather than as a border.
//
// The core is where the two themes part. On the light page nothing can
// out-brighten the background, so heat has to be carried by saturation: the core
// lands on a saturated gold, where a white one would just be a hole. On the dark
// page it can go lighter, but not to white - against black the rim and the plume
// cores both sit on this colour, and a white one blows both out.
export function sunPalette(colors: SunColors): SunPalette {
  const [h, s, l] = rgbToHsl(colors.accent)
  const bgLum = 0.299 * colors.bg[0] + 0.587 * colors.bg[1] + 0.114 * colors.bg[2]
  const light = bgLum > 0.5

  return {
    // The limb only has to sit below the body to read as a rim. On the dark page
    // that can go nearly black; on the light one it can't, or the thin plasma
    // riding the same colour composites down into grey soot.
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
    // A huge sun sitting mostly below the footer: we only see its top curvature,
    // a horizon cresting the bottom of the page. R is large in canvas-height
    // units so the limb reads as a gentle arc, not a full disc, and the whole
    // body climbs a little as uRise goes 0 -> 1.
    float R = 4.0;
    vec2 center = vec2(0.5, mix(-4.2, -3.55, uRise));
    // x measured in the same units as y (canvas heights) so the arc keeps its
    // shape across panel widths.
    vec2 p = vec2((vUv.x - center.x) * uAspect, vUv.y - center.y);

    float r = length(p);
    float ang = atan(p.y, p.x);
    float d = r - R; // signed distance from the limb, negative inside the body

    // Only the top cap is ever on screen, so the visible angles sit in a thin
    // band either side of straight up. Measuring from there keeps the edge
    // detail at a usable frequency instead of smeared across a whole turn.
    float arc = ang - PI * 0.5;

    // Photosphere: one slow churn, domain-warped along a curl flow so the surface
    // drifts instead of sitting still. Deliberately shallow. This is a stylised
    // sun, so the surface wants movement, not detail - stacking finer scales on
    // here to chase a real photosphere just turns the disc to noise.
    vec2 flow = curl(p * 2.2 + uTime * 0.04) * 0.25;
    float churn = smoothstep(0.3, 0.64, fbm(p * 2.6 + flow + uTime * 0.03));
    float mottle = (churn - 0.5) * 0.22;

    float disc = 1.0 - smoothstep(-0.025, 0.025, d);

    // The surface brightens toward the limb rather than away from it, in two
    // terms: a broad climb that gives the cap its curvature, and a narrow bright
    // ring on the edge itself. The ring is the important one - the corona is that
    // edge carrying on outward, so without it the disc meets its own glow at a
    // dark seam.
    float depth = clamp(-d / 0.75, 0.0, 1.0);
    float sphere = 1.0 - smoothstep(0.0, 0.85, depth);
    float ring = 1.0 - smoothstep(0.0, 0.16, depth);
    float lum = 0.44 + 0.2 * sphere + 0.38 * ring + mottle;

    // The plasma is worked in polar space: arc runs across the visible edge, span
    // runs outward from it. Stretching the noise hard along the outward axis
    // turns blobs into streaks, and a curl warp drags those streaks sideways,
    // which is what makes it wisp instead of clumping into clouds with edges.
    //
    // span is signed, so the plasma decays on both sides of the limb rather than
    // stopping dead at it. It fades four times faster going inward, which keeps a
    // plume rooted on the edge instead of buried in the disc.
    float span = d < 0.0 ? -d * 4.0 : d;
    vec2 polar = vec2(arc * 26.0, span * 6.0 - uTime * 0.22);
    vec2 swirl = curl(polar * 0.5 + uTime * 0.06) * 1.2;
    float wisp = fbm(polar + swirl);
    // Squared, so most of the band stays empty and what's left reads as thin
    // smoke rather than an even haze.
    wisp *= wisp;

    // Corona: a soft sheath riding the limb, thickened and thinned by the same
    // wisp field so the edge licks rather than sitting as a clean ring.
    float corona = exp(-span * 16.0) * (0.2 + 0.9 * wisp);

    // Prominences. A slow angular height field keeps the whole limb licking, and
    // four burst slots each fire on their own clock, so every few seconds
    // somewhere on the edge throws a longer plume. Both feed one reach, and the
    // plasma falls off exponentially over it, so a plume thins out into nothing
    // instead of ending somewhere.
    float lick = fbm(vec2(arc * 13.0, uTime * 0.15));
    float reach = 0.018 + 0.05 * lick;

    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float period = 9.0 + 5.0 * vnHash(vec2(fi, 2.0));
      float clock = uTime / period + vnHash(vec2(fi, 5.0));
      float shot = floor(clock); // which firing this is, so each gets its own spot
      float phase = fract(clock);

      // Up fast, down slow: erupt, then settle back.
      float env = smoothstep(0.0, 0.12, phase) * (1.0 - smoothstep(0.12, 0.8, phase));

      float at = (vnHash(vec2(shot, fi + 11.0)) - 0.5) * 0.62;
      float width = 0.03 + 0.06 * vnHash(vec2(shot, fi + 23.0));
      float off = (arc - at) / width;
      reach += env * exp(-off * off) * (0.09 + 0.16 * vnHash(vec2(shot, fi + 37.0)));
    }

    float prom = exp(-span / max(reach, 0.004)) * wisp * 1.6;

    // How much of the pixel the plasma covers. Not masked against the disc: the
    // plasma is a layer over the sun, so it carries across the limb.
    float cover = clamp(corona * 0.55 + prom, 0.0, 1.0);
    // The panel has a hard top edge and a tall burst can reach it. Fade the
    // plasma out before it gets there, since a plume sliced off by the canvas
    // bounds reads as a rendering bug.
    cover *= smoothstep(1.0, 0.84, vUv.y);

    // Both the surface and the plasma colour off the same three-stop ramp, deep
    // limb -> accent body -> near-white, so the sun gets a range of colour
    // instead of being one flat slab of accent.
    //
    // The hot end has to be reached, not approached: the limb tops out around
    // 0.96, so a ramp that only finishes at 1.3 leaves the ring a fifth of the
    // way to the hot colour and the whole disc comes out flat green.
    vec3 surface = mix(uLimb, uBody, smoothstep(0.05, 0.55, lum));
    surface = mix(surface, uHot, smoothstep(0.62, 1.0, lum));

    // In the plasma the ramp runs on coverage instead, and it reaches the body
    // colour early: coverage already thins the plasma out through alpha, so
    // letting it darken the colour too leaves the light page with what looks like
    // soot rather than glowing gas. Only the spine of a plume goes hot.
    vec3 plasma = mix(uLimb, uBody, smoothstep(0.02, 0.25, cover));
    plasma = mix(plasma, uHot, smoothstep(0.35, 0.85, cover));

    // Composite the plasma over the disc, rather than cross-fading the two by the
    // disc mask. The disc is the opaque base and the plasma is a layer on top of
    // it, drawn with its own coverage exactly the way it's drawn over the page
    // outside the limb. Cross-fading instead leaves a band of half-mixed colour
    // along the edge and clips the plumes where they cross it.
    float alpha = cover + disc * (1.0 - cover);
    vec3 col = plasma * cover + surface * disc * (1.0 - cover);

    // Already premultiplied by the composite above, which is what the renderer
    // expects, so the corona sits softly over the page instead of darkening it.
    gl_FragColor = vec4(col, alpha);
  }
`

// Cap the backing resolution. This is a soft glow, so extra pixels buy nothing.
const MAX_PIXEL_RATIO = 1.5

export class SunField {
  private readonly THREE: typeof THREE
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly cam: THREE.OrthographicCamera
  private readonly mat: THREE.ShaderMaterial

  // Smoothed rise so scroll jitter doesn't jump the sun.
  private rise = 0
  private riseTarget = 0

  // Current backing-store size, so the per-frame resize call can bail when
  // nothing changed. Three's setSize writes canvas.width/height every call,
  // and re-assigning those resets the drawing buffer even at the same value.
  private bufWidth = 0
  private bufHeight = 0

  private disposed = false

  private constructor(t: typeof THREE, canvas: HTMLCanvasElement, colors: SunColors) {
    this.THREE = t

    // No antialias: the only geometry is a fullscreen quad, so MSAA has no
    // edges to smooth and just multiplies the framebuffer memory and fill.
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

  // Build the engine, or null if WebGL isn't available so the caller can fall
  // back to a static CSS sun.
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

  // 0 = below the fold, 1 = fully risen. Smoothed toward this in frame().
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

  // Advance and draw. `dt` seconds, `time` a monotonic seconds clock for noise.
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
