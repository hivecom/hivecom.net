// The fullscreen-player smoke visualizer engine, inspired by XRA's video work:
// a 3D world-space scene (splotch emitters and occasional streak lines)
// composited through a screen-space feedback buffer. Two things make the look:
//
//  - The accumulation is screen-space but the bright stuff lives in 3D world
//    space, so when the camera moves, world-fixed points smear across the screen
//    into trails. That's the "camera drags the splotches" effect.
//  - Each frame the previous accumulation is faded, softly blurred, and pushed
//    along a curl-noise flow before the new scene is added on top, so every
//    bright stamp dissolves into wisping smoke instead of just ghosting.
//
// Audio drives it: bass hits blast splotches and kick the camera, sharp hits
// flash a long line that runs off the edges, and a calm passage slows the
// splotch brush into drawn lines. Three is loaded with a dynamic import (the
// AdminGlobe convention), so it never lands in the SSR bundle.

import type * as THREE from 'three'
import type { AudioFeatures } from '@/lib/audio/features'

// Theme colours, each as a 0..1 [r, g, b] triple. The visualizer reads these
// from the VUI CSS tokens so it tracks the active light/dark theme.
export interface SmokeColors {
  // Empty field / canvas background (--color-bg).
  bg: [number, number, number]
  // Bright additive smoke (--color-accent).
  accent: [number, number, number]
  // Subtractive cutouts (--color-bg-lowered), a touch darker than the background.
  dark: [number, number, number]
}

// Cap the backing resolution. The feedback loop is fill-rate bound (several
// fullscreen passes a frame), so past this it costs a lot for little gain.
const MAX_PIXEL_RATIO = 1.25
const MAX_LONG_EDGE = 1800

// Splotch pools, round-robin allocated, dead points culled in the shader. White
// stamps add light; black stamps reverse-subtract, carving dark cutouts into the
// accumulated smoke so the two fight each other.
const MAX_SPLOTCHES = 120
const MAX_CUTOUTS = 120
// Long streak lines. Each flashes for a single frame on a hit, long enough to
// run off both edges of the frame, then the feedback buffer smears it away.
const MAX_LINES = 32

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// Feedback pass: fade + soft blur + curl-noise advection of the prior frame.
const ADVECT_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tPrev;
  uniform vec2 uTexel;
  uniform float uTime;
  uniform float uDecay;
  uniform float uTurb;
  uniform float uRise;
  varying vec2 vUv;

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = dot(hash2(i) - 0.5, f);
    float b = dot(hash2(i + vec2(1.0, 0.0)) - 0.5, f - vec2(1.0, 0.0));
    float c = dot(hash2(i + vec2(0.0, 1.0)) - 0.5, f - vec2(0.0, 1.0));
    float d = dot(hash2(i + vec2(1.0, 1.0)) - 0.5, f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  // Curl of a scalar noise field gives a divergence-free flow that swirls
  // instead of pumping outward, which is what reads as smoke.
  vec2 curl(vec2 p) {
    float e = 0.06;
    float x = vnoise(p + vec2(0.0, e)) - vnoise(p - vec2(0.0, e));
    float y = vnoise(p + vec2(e, 0.0)) - vnoise(p - vec2(e, 0.0));
    return vec2(x, -y) / (2.0 * e);
  }

  void main() {
    vec2 flow = curl(vUv * 3.0 + uTime * 0.03) * uTurb;
    flow.y -= uRise;
    vec2 uv = vUv + flow * uTexel;

    // Energy-preserving 5-tap blur (center 0.6, four neighbours 0.1) so trails
    // diffuse into smoke. Decay then bleeds the whole thing toward black.
    vec3 c = texture2D(tPrev, uv).rgb * 0.6;
    c += texture2D(tPrev, uv + vec2(uTexel.x, 0.0)).rgb * 0.1;
    c += texture2D(tPrev, uv - vec2(uTexel.x, 0.0)).rgb * 0.1;
    c += texture2D(tPrev, uv + vec2(0.0, uTexel.y)).rgb * 0.1;
    c += texture2D(tPrev, uv - vec2(0.0, uTexel.y)).rgb * 0.1;

    gl_FragColor = vec4(c * uDecay, 1.0);
  }
`

// Display pass: the buffer holds a single signed ink density (all channels stay
// equal). Map it onto the theme here: empty field is the background colour,
// positive (additive smoke) tends toward the accent, negative (subtractive
// cutouts) toward the darker background. Vignette and grain only touch the ink,
// so the flat background reads as exactly the theme background.
const DISPLAY_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tSrc;
  uniform float uTime;
  uniform vec3 uBg;
  uniform vec3 uAccent;
  uniform vec3 uDark;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }

  void main() {
    float d = texture2D(tSrc, vUv).r;
    float pos = max(d, 0.0);
    float neg = max(-d, 0.0);
    pos = pow(pos / (1.0 + pos * 0.6), 0.85);
    neg = pow(neg / (1.0 + neg * 0.6), 0.85);

    // Loose vignette, applied to the ink so the background stays uniform.
    vec2 q = vUv - 0.5;
    float vig = smoothstep(1.5, 0.1, dot(q, q) * 2.0);
    pos = clamp(pos * vig, 0.0, 1.0);
    neg = clamp(neg * vig, 0.0, 1.0);

    vec3 col = uBg;
    col = mix(col, uAccent, pos);
    col = mix(col, uDark, neg);
    // Grain mostly inside the smoke, a whisper over the background.
    col += (hash(vUv * vec2(1920.0, 1080.0) + uTime) - 0.5) * (0.02 * (pos + neg) + 0.008);

    gl_FragColor = vec4(col, 1.0);
  }
`

const SPLOTCH_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aBright;
  attribute float aSeed;
  uniform float uPixelRatio;
  varying float vBright;
  varying float vSeed;
  void main() {
    vBright = aBright;
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aBright <= 0.002 ? 0.0 : aSize * uPixelRatio * (260.0 / max(0.1, -mv.z));
  }
`

// Soft gaussian disc with fbm noise carved through it, so each stamp reads as a
// torn, smoky splotch instead of a clean dot. The per-point seed offsets the
// noise so no two stamps look alike. Output is pure-additive (a = 1).
const SPLOTCH_FRAG = /* glsl */ `
  precision highp float;
  varying float vBright;
  varying float vSeed;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int k = 0; k < 4; k++) {
      v += amp * noise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;
    float g = exp(-r * r * 6.0);
    float n = fbm(gl_PointCoord * 5.0 + vSeed * 40.0);
    float intensity = g * (0.25 + 1.1 * n) * vBright;
    gl_FragColor = vec4(vec3(max(intensity, 0.0)), 1.0);
  }
`

// Place a point on a jittered shell around the origin.
function shellPoint(out: THREE.Vector3, radius: number) {
  const u = Math.random() * 2 - 1
  const t = Math.random() * Math.PI * 2
  const r = Math.sqrt(1 - u * u)
  out.set(Math.cos(t) * r, u, Math.sin(t) * r).multiplyScalar(radius)
}

// A pool of soft splotch sprites with one blend mode. 'add' lights the buffer
// (white smoke); 'sub' reverse-subtracts (black cutouts). Both use the same
// shader and a positive brightness, the blend mode decides the sign.
class SplotchLayer {
  readonly points: THREE.Points
  private readonly mat: THREE.ShaderMaterial
  private readonly bright: Float32Array
  private readonly aPos: THREE.BufferAttribute
  private readonly aSize: THREE.BufferAttribute
  private readonly aSeed: THREE.BufferAttribute
  private readonly aBright: THREE.BufferAttribute
  private cursor = 0

  constructor(t: typeof THREE, private readonly count: number, mode: 'add' | 'sub') {
    const geo = new t.BufferGeometry()
    const sizes = new Float32Array(count)
    const seeds = new Float32Array(count)
    this.bright = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      sizes[i] = 1
      seeds[i] = Math.random()
    }
    this.aPos = new t.BufferAttribute(new Float32Array(count * 3), 3)
    this.aSize = new t.BufferAttribute(sizes, 1)
    this.aSeed = new t.BufferAttribute(seeds, 1)
    this.aBright = new t.BufferAttribute(this.bright, 1)
    this.aPos.setUsage(t.DynamicDrawUsage)
    this.aSize.setUsage(t.DynamicDrawUsage)
    this.aSeed.setUsage(t.DynamicDrawUsage)
    this.aBright.setUsage(t.DynamicDrawUsage)
    geo.setAttribute('position', this.aPos)
    geo.setAttribute('aSize', this.aSize)
    geo.setAttribute('aSeed', this.aSeed)
    geo.setAttribute('aBright', this.aBright)

    this.mat = new t.ShaderMaterial({
      vertexShader: SPLOTCH_VERT,
      fragmentShader: SPLOTCH_FRAG,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms: { uPixelRatio: { value: 1 } },
    })
    if (mode === 'add') {
      this.mat.blending = t.AdditiveBlending
    }
    else {
      // result = dst - src, so the stamp carves a hole where smoke already is.
      this.mat.blending = t.CustomBlending
      this.mat.blendEquation = t.ReverseSubtractEquation
      this.mat.blendSrc = t.OneFactor
      this.mat.blendDst = t.OneFactor
    }
    this.points = new t.Points(geo, this.mat)
    this.points.frustumCulled = false
  }

  setPixelRatio(pr: number) {
    this.mat.uniforms.uPixelRatio!.value = pr
  }

  emit(pos: THREE.Vector3, size: number, bright: number) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.count
    this.aPos.setXYZ(i, pos.x, pos.y, pos.z)
    this.aSize.setX(i, size)
    this.aSeed.setX(i, Math.random())
    this.bright[i] = bright
    this.aPos.needsUpdate = true
    this.aSize.needsUpdate = true
    this.aSeed.needsUpdate = true
  }

  decay(factor: number) {
    for (let i = 0; i < this.count; i++)
      this.bright[i]! *= factor
    this.aBright.needsUpdate = true
  }

  dispose() {
    this.points.geometry.dispose()
    this.mat.dispose()
  }
}

export class SmokeField {
  private readonly THREE: typeof THREE
  private readonly renderer: THREE.WebGLRenderer
  private readonly camera: THREE.PerspectiveCamera
  private readonly scene: THREE.Scene
  private readonly worldGroup: THREE.Group

  private readonly quadScene: THREE.Scene
  private readonly quadCam: THREE.OrthographicCamera
  private readonly advectMat: THREE.ShaderMaterial
  private readonly displayMat: THREE.ShaderMaterial

  private rtA: THREE.WebGLRenderTarget
  private rtB: THREE.WebGLRenderTarget

  // White (additive) and black (subtractive) splotch pools.
  private readonly white: SplotchLayer
  private readonly black: SplotchLayer

  // Streak-line pool: one LineSegments, coloured per-vertex so a single segment
  // can flash white for one frame while the rest stay black (additive black adds
  // nothing). On a hit we reposition a segment to a long random streak and light
  // it; the next frame it goes dark and the feedback buffer drags it off.
  private readonly lines: THREE.LineSegments
  private readonly linesMat: THREE.LineBasicMaterial
  private readonly aLinePos: THREE.BufferAttribute
  private readonly aLineCol: THREE.BufferAttribute
  private readonly lineCol: Float32Array
  private readonly lineLit = new Uint8Array(MAX_LINES)
  private lineCursor = 0

  // Camera orbit state: angles, angular velocity, and a kick the music adds to.
  private theta = 0
  private phi = 0.2
  private thetaVel = 0.04
  private phiVel = 0.0
  private radius = 6

  // Smoothed style state so the look glides between moods.
  private turb = 3
  private decay = 0.09
  private brushPhase = 1
  // Horizontal spread so the cloud fills a wide frame instead of a centred
  // square. Set from the aspect ratio in resize.
  private spreadX = 1
  // Rising-edge latches: emit one burst / flash per detected hit instead of
  // every frame the feature sits above threshold.
  private bassHeld = false
  private highHeld = false
  private lineHeld = false
  private readonly scratch: THREE.Vector3
  private readonly scratch2: THREE.Vector3

  private width = 1
  private height = 1
  private pixelRatio = 1
  private disposed = false

  private constructor(t: typeof THREE, canvas: HTMLCanvasElement, colors: SmokeColors) {
    this.THREE = t
    this.scratch = new t.Vector3()
    this.scratch2 = new t.Vector3()

    const renderer = new t.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' })
    renderer.autoClear = true
    renderer.setClearColor(new t.Color(colors.bg[0], colors.bg[1], colors.bg[2]), 1)
    this.renderer = renderer

    this.camera = new t.PerspectiveCamera(55, 1, 0.1, 100)
    this.scene = new t.Scene()
    this.worldGroup = new t.Group()
    this.scene.add(this.worldGroup)

    // Fullscreen quad shared by the advect and display passes.
    this.quadScene = new t.Scene()
    this.quadCam = new t.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quadGeo = new t.PlaneGeometry(2, 2)

    this.advectMat = new t.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: ADVECT_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tPrev: { value: null },
        uTexel: { value: new t.Vector2(1, 1) },
        uTime: { value: 0 },
        uDecay: { value: 0.94 },
        uTurb: { value: 6 },
        uRise: { value: 1.2 },
      },
    })
    this.displayMat = new t.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: DISPLAY_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tSrc: { value: null },
        uTime: { value: 0 },
        uBg: { value: new t.Vector3(colors.bg[0], colors.bg[1], colors.bg[2]) },
        uAccent: { value: new t.Vector3(colors.accent[0], colors.accent[1], colors.accent[2]) },
        uDark: { value: new t.Vector3(colors.dark[0], colors.dark[1], colors.dark[2]) },
      },
    })
    this.quadScene.add(new t.Mesh(quadGeo, this.advectMat))

    this.rtA = this.makeTarget(1, 1)
    this.rtB = this.makeTarget(1, 1)

    // Two splotch pools. Black draws first so white can light over the cutouts.
    this.black = new SplotchLayer(t, MAX_CUTOUTS, 'sub')
    this.white = new SplotchLayer(t, MAX_SPLOTCHES, 'add')
    this.worldGroup.add(this.black.points)
    this.worldGroup.add(this.white.points)

    // Streak lines: a pool of long segments, all dark at rest. Per-vertex colour
    // lets us light a single one for a frame without touching the others.
    const lineGeo = new t.BufferGeometry()
    this.lineCol = new Float32Array(MAX_LINES * 2 * 3)
    this.aLinePos = new t.BufferAttribute(new Float32Array(MAX_LINES * 2 * 3), 3)
    this.aLineCol = new t.BufferAttribute(this.lineCol, 3)
    this.aLinePos.setUsage(t.DynamicDrawUsage)
    this.aLineCol.setUsage(t.DynamicDrawUsage)
    lineGeo.setAttribute('position', this.aLinePos)
    lineGeo.setAttribute('color', this.aLineCol)
    this.linesMat = new t.LineBasicMaterial({ vertexColors: true, transparent: true, blending: t.AdditiveBlending, depthTest: false, depthWrite: false })
    this.lines = new t.LineSegments(lineGeo, this.linesMat)
    this.lines.frustumCulled = false
    this.worldGroup.add(this.lines)
  }

  // Build the engine, or null if WebGL isn't available so the caller can fall
  // back to an empty panel.
  static async create(canvas: HTMLCanvasElement, colors: SmokeColors): Promise<SmokeField | null> {
    try {
      const t = await import('three')
      // Probe for a working context before committing.
      const probe = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
      if (!probe)
        return null
      return new SmokeField(t, canvas, colors)
    }
    catch {
      return null
    }
  }

  // Re-point the palette at the current theme (called when light/dark flips).
  setColors(colors: SmokeColors) {
    if (this.disposed)
      return
    const t = this.THREE
    ;(this.displayMat.uniforms.uBg!.value as THREE.Vector3).set(colors.bg[0], colors.bg[1], colors.bg[2])
    ;(this.displayMat.uniforms.uAccent!.value as THREE.Vector3).set(colors.accent[0], colors.accent[1], colors.accent[2])
    ;(this.displayMat.uniforms.uDark!.value as THREE.Vector3).set(colors.dark[0], colors.dark[1], colors.dark[2])
    this.renderer.setClearColor(new t.Color(colors.bg[0], colors.bg[1], colors.bg[2]), 1)
  }

  private makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const t = this.THREE
    return new t.WebGLRenderTarget(w, h, {
      type: t.HalfFloatType,
      minFilter: t.LinearFilter,
      magFilter: t.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    })
  }

  resize(width: number, height: number, dpr: number) {
    if (this.disposed || width <= 0 || height <= 0)
      return
    // Cap the backing buffer so the multi-pass loop stays affordable.
    let pr = Math.min(dpr, MAX_PIXEL_RATIO)
    const longEdge = Math.max(width, height) * pr
    if (longEdge > MAX_LONG_EDGE)
      pr *= MAX_LONG_EDGE / longEdge

    this.width = width
    this.height = height
    this.pixelRatio = pr

    const bw = Math.max(1, Math.round(width * pr))
    const bh = Math.max(1, Math.round(height * pr))

    this.renderer.setPixelRatio(1)
    this.renderer.setSize(bw, bh, false)
    this.rtA.setSize(bw, bh)
    this.rtB.setSize(bw, bh)
    ;(this.advectMat.uniforms.uTexel!.value as THREE.Vector2).set(1 / bw, 1 / bh)
    this.white.setPixelRatio(pr)
    this.black.setPixelRatio(pr)

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    // Bias emitter spread toward the wide axis so a 16:9 panel fills out to the
    // sides instead of clustering in a centred square.
    this.spreadX = Math.max(1, this.camera.aspect * 0.9)
  }

  // Spawn a burst of splotches into a layer, scattered on a shell, sized and
  // brightened by strength.
  private emitBurst(layer: SplotchLayer, count: number, strength: number, shell: number, sizeBase: number) {
    for (let n = 0; n < count; n++) {
      shellPoint(this.scratch, shell * (0.7 + Math.random() * 0.6))
      this.scratch.x *= this.spreadX
      layer.emit(
        this.scratch,
        sizeBase * (0.6 + Math.random() * 0.9),
        Math.min(1.6, strength * (0.7 + Math.random() * 0.6)),
      )
    }
  }

  // Advance the simulation by dt seconds for these features, then render. `time`
  // is a monotonic seconds clock used for noise and drift.
  frame(f: AudioFeatures, dt: number, time: number) {
    if (this.disposed)
      return
    const step = Math.min(dt, 0.05)

    // --- Style state. Mood weights cross-fade the look. ---
    // Calm/flowing -> longer trails (decay near 1) and gentle turbulence. Busy
    // -> shorter trails so blasts pop and clear, more swirl.
    const targetDecay = 0.95 + f.flow * 0.07 - f.splatter * 0.02
    const targetTurb = 4 + f.energy * 7 + f.splatter * 6
    this.decay += (targetDecay - this.decay) * 0.1
    this.turb += (targetTurb - this.turb) * 0.1
    this.advectMat.uniforms.uDecay!.value = this.decay
    this.advectMat.uniforms.uTurb!.value = this.turb
    this.advectMat.uniforms.uRise!.value = 0.6 + f.energy * 1.6
    this.advectMat.uniforms.uTime!.value = time
    this.displayMat.uniforms.uTime!.value = time

    // --- Emitters ---
    // Bass hits: a white blast per kick (rising edge), plus a few black cutouts
    // scattered through it so the blast reads as torn smoke, not a clean glow.
    const bassHit = f.bassHit > 0.3
    if (bassHit && !this.bassHeld) {
      const s = f.bassHit
      this.emitBurst(this.white, Math.round(2 + s * 5), s * 1.4, 3.6, 0.9 + s * 0.7)
      this.emitBurst(this.black, Math.round(1 + s * 3), s * 1.2, 3.4, 0.7 + s * 0.5)
    }
    this.bassHeld = bassHit

    // High hits: small black cutouts carving detail, with a couple of tiny white
    // sparkles riding along, so snares/hats add lots of little fighting bits.
    const highHit = f.highHit > 0.38
    if (highHit && !this.highHeld) {
      const h = f.highHit
      this.emitBurst(this.black, Math.round(2 + h * 4), h * 0.9, 3.8, 0.4)
      this.emitBurst(this.white, Math.round(1 + h * 2), h * 0.8, 3.8, 0.22)
    }
    this.highHeld = highHit

    // General onsets carve a black cutout or two even between the named hits, so
    // there's always a little churn.
    if (f.onset > 0.4 && Math.random() < 0.5)
      this.emitBurst(this.black, 1 + Math.round(f.onset * 2), f.onset * 0.8, 3.4, 0.35)

    // Flow mood: a slow brush that traces a path and keeps stamping, so calm
    // passages draw long continuous lines rather than discrete blobs.
    if (f.flow > 0.35) {
      this.brushPhase += step * (0.3 + f.energy * 0.6)
      const p = this.brushPhase
      this.scratch.set(
        Math.sin(p * 0.7) * 2.6 * this.spreadX,
        Math.sin(p * 1.1 + 1.3) * 1.8,
        Math.cos(p * 0.9) * 2.6,
      )
      this.white.emit(this.scratch, 0.5, f.flow * (0.4 + f.level * 0.8))
    }

    // Decay both pools. Busier passages fade faster so the screen clears.
    const splotchDecay = Math.exp(-step * (5 + f.splatter * 8))
    this.white.decay(splotchDecay)
    this.black.decay(Math.exp(-step * (6 + f.splatter * 8)))

    // Streak lines. Dark at rest; on a sharp hit (rising edge, thinned out so
    // they only flash in now and then) one segment is repositioned to a long
    // random streak and lit for a single frame, then the feedback buffer drags
    // it off the edges. First, black out whatever was lit last frame.
    let lineDirty = false
    for (let i = 0; i < MAX_LINES; i++) {
      if (this.lineLit[i]) {
        this.lineLit[i] = 0
        this.lineCol.fill(0, i * 6, i * 6 + 6)
        lineDirty = true
      }
    }
    const lineHit = f.highHit > 0.55
    if (lineHit && !this.lineHeld && Math.random() < 0.6) {
      const i = this.lineCursor
      this.lineCursor = (this.lineCursor + 1) % MAX_LINES
      // Random anchor in the field and a random direction; endpoints far enough
      // apart that the segment runs off both sides of the frame.
      shellPoint(this.scratch, Math.random() * 2.5)
      shellPoint(this.scratch2, 1)
      const half = 60 + Math.random() * 160
      this.aLinePos.setXYZ(
        i * 2,
        this.scratch.x - this.scratch2.x * half,
        this.scratch.y - this.scratch2.y * half,
        this.scratch.z - this.scratch2.z * half,
      )
      this.aLinePos.setXYZ(
        i * 2 + 1,
        this.scratch.x + this.scratch2.x * half,
        this.scratch.y + this.scratch2.y * half,
        this.scratch.z + this.scratch2.z * half,
      )
      const b = 0.6 + f.highHit * 0.6
      this.lineCol.fill(b, i * 6, i * 6 + 6)
      this.lineLit[i] = 1
      this.aLinePos.needsUpdate = true
      lineDirty = true
    }
    this.lineHeld = lineHit
    if (lineDirty)
      this.aLineCol.needsUpdate = true

    // The whole field turns slowly so there's always parallax for the trails.
    this.worldGroup.rotation.y += step * 0.05

    // --- Camera: continuous drift plus music-driven kicks, so motion drags the
    // smoke. Bass impulses shove the orbit; damping settles it. ---
    if (f.bassHit > 0.4) {
      this.thetaVel += (Math.random() - 0.5) * f.bassHit * 1.4
      this.phiVel += (Math.random() - 0.5) * f.bassHit * 0.8
    }
    this.thetaVel += (0.05 - this.thetaVel) * 0.01
    this.phiVel *= 1 - step * 1.2
    this.theta += this.thetaVel * step * 1.6
    this.phi += this.phiVel * step
    this.phi = Math.max(-1.2, Math.min(1.2, this.phi))
    this.radius += ((6 - f.energy * 1.2) - this.radius) * 0.02

    const cp = Math.cos(this.phi)
    this.camera.position.set(
      Math.sin(this.theta) * cp * this.radius,
      Math.sin(this.phi) * this.radius,
      Math.cos(this.theta) * cp * this.radius,
    )
    this.camera.lookAt(0, 0, 0)

    this.render()
  }

  private render() {
    const r = this.renderer

    // 1) Advect the previous accumulation (rtA) into rtB, filling it.
    this.advectMat.uniforms.tPrev!.value = this.rtA.texture
    this.setQuadMaterial(this.advectMat)
    r.autoClear = true
    r.setRenderTarget(this.rtB)
    r.render(this.quadScene, this.quadCam)

    // 2) Add the live 3D scene on top, no clear.
    r.autoClear = false
    r.render(this.scene, this.camera)
    r.autoClear = true

    // 3) Tonemap rtB to the screen.
    this.displayMat.uniforms.tSrc!.value = this.rtB.texture
    this.setQuadMaterial(this.displayMat)
    r.setRenderTarget(null)
    r.render(this.quadScene, this.quadCam)

    // Swap: rtB is now the freshest accumulation.
    const tmp = this.rtA
    this.rtA = this.rtB
    this.rtB = tmp
  }

  private setQuadMaterial(mat: THREE.ShaderMaterial) {
    const mesh = this.quadScene.children[0] as THREE.Mesh
    mesh.material = mat
  }

  dispose() {
    if (this.disposed)
      return
    this.disposed = true
    this.rtA.dispose()
    this.rtB.dispose()
    this.white.dispose()
    this.black.dispose()
    this.advectMat.dispose()
    this.displayMat.dispose()
    this.linesMat.dispose()
    this.lines.geometry.dispose()
    ;(this.quadScene.children[0] as THREE.Mesh).geometry.dispose()
    this.renderer.dispose()
  }
}
