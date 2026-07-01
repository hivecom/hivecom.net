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
//  - Blackbody ramp: drive the core->limb colour off a temperature curve
//    (white-hot core, accent mid, deep-red limb) instead of a straight mix to
//    accent, for a more physical look. Keep it accent-anchored for the theme.
//  - Sphere + limb darkening: swap the flat disc for an actual sphere with
//    limb-darkening and rotating surface UVs, so it reads as a body, not a decal.
//  - Sunspots / prominences: subtractive fbm stamps (like the smoke field's black
//    cutouts) carving darker granules, plus arc geometry licking off the limb.

import type * as THREE from 'three'
import { curlNoiseChunk, fbmChunk } from '@/lib/gl/noise'

// Theme colour as a 0..1 [r, g, b] triple, read from the VUI accent token so the
// sun tracks light/dark.
export interface SunColors {
  accent: [number, number, number]
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
  uniform vec3 uAccent;
  varying vec2 vUv;

  ${curlNoiseChunk}
  ${fbmChunk}

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

    // Photosphere: big soft granules, domain-warped along a slow curl flow so
    // the surface churns like plasma instead of sitting still.
    vec2 flow = curl(p * 2.5 + uTime * 0.04) * 0.15;
    float grain = fbm(p * 3.0 + flow + uTime * 0.03);
    float disc = 1.0 - smoothstep(-0.06, 0.06, d);
    float surface = disc * (0.85 + 0.55 * grain);

    // Corona: glow bleeding up past the limb, broken into slow flares by angular
    // fbm so the edge licks and flickers rather than being a clean ring.
    float flare = fbm(vec2(ang * 3.0, r - uTime * 0.1));
    float halo = exp(-max(d, 0.0) * 7.0) * (0.45 + 0.8 * flare);

    float intensity = surface + halo * 0.8;

    // Accent through the body, white-hot in the brightest granules.
    float whiteness = smoothstep(0.95, 1.5, surface);
    vec3 sunCol = mix(uAccent, vec3(1.0), whiteness);

    float alpha = clamp(intensity, 0.0, 1.0);
    // Premultiplied output (renderer uses premultipliedAlpha) so the corona
    // composites softly over the page instead of darkening it.
    gl_FragColor = vec4(sunCol * alpha, alpha);
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

  private disposed = false

  private constructor(t: typeof THREE, canvas: HTMLCanvasElement, colors: SunColors) {
    this.THREE = t

    const renderer = new t.WebGLRenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
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
        uAccent: { value: new t.Vector3(colors.accent[0], colors.accent[1], colors.accent[2]) },
      },
    })
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
    const accent = this.mat.uniforms.uAccent!.value as THREE.Vector3
    accent.set(colors.accent[0], colors.accent[1], colors.accent[2])
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
