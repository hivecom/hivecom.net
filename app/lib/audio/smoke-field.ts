// The fullscreen-player smoke visualizer engine, inspired by XRA's Methlab player:
// a 3D world-space scene (splotch emitters, streak lines, distorted shards)
// composited through screen-space feedback buffers. What makes the look:
//
//  - The accumulation is screen-space but the bright stuff lives in 3D world
//    space, so when the camera moves, world-fixed points smear across the screen
//    into trails. That's the "camera drags the splotches" effect.
//  - Two feedback buffers, not one: a slow background buffer that fades, blurs and
//    advects along a curl-noise flow so stamps dissolve into persistent smoke, and
//    a fast foreground buffer that clears almost immediately so hits pop and vanish.
//    The display pass composites both, smoke toward the accent, hits toward the
//    bright foreground text colour.
//
// Audio drives it: bass hits bloom smoke and kick the camera, big hits throw a
// distorted wireframe shard and a bright flash that clears instantly, sharp hits
// lance streak lines, and a calm passage slows the brush into drawn lines. Three is
// loaded with a dynamic import (the AdminGlobe convention), so it never lands in the
// SSR bundle.

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
  // Bright foreground hits (--color-text), so the fast flashes punch a second tone
  // against the accent smoke.
  text: [number, number, number]
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
// Distorted wireframe shards flashed in on a big hit. A small pool, they're rare
// punctuation on the drops, not a steady emitter.
const MAX_SHARDS = 6

// Render layers: the persistent smoke draws on one, the fast hits on the other, so
// each composites through its own feedback buffer.
const LAYER_BG = 0
const LAYER_FG = 1

// Live-tunable knobs, driven by the settings panel. Every field maps to a constant
// that used to be baked into the engine; the defaults are the current look. The
// engine reads these each frame, so changes take effect immediately.
export interface SmokeConfig {
  // Camera
  cameraDistance: number // how far the orbit sits from the field
  cameraDrift: number // base idle rotation speed
  cameraAudioKick: number // how hard bass shoves the camera (0 = ignores the music)
  cameraBeatPump: number // in/out pump on the beat
  cameraSway: number // how much the field slides around in space
  // Motion pace
  paceEnergy: number // how much loudness speeds everything up
  tempoInfluence: number // 0 ignores tempo, 1 fully ties pace to BPM
  flowSpeed: number // advection swirl animation rate
  // Background smoke
  smokePersist: number // how long the smoke lingers (feedback decay, near 1)
  turbulence: number // swirl strength
  buoyancy: number // upward drift of the smoke
  smokeBlur: number // how much the smoke diffuses each frame
  bedDensity: number // how many ambient dust specks
  bedSize: number // size of those specks
  // Hits
  bassBloomSize: number // size of the kick bloom
  bassPush: number // strength of the buffer shove on a kick
  bigFlashSize: number // size of the big-hit flash
  bigPush: number // shove strength on a big hit
  shards: boolean // spawn distorted wireframe shards on big hits
  cutouts: number // strength of the dark cutouts
  lines: number // how often streak lines fire
  lineAccent: number // 0 = all lines are cutouts, 1 = all accent, 0.5 = an even mix
  // Look
  contrast: number // display contrast
  grain: number // film grain amount
  dust: number // sparkle dust amount
}

export const DEFAULT_SMOKE_CONFIG: SmokeConfig = {
  cameraDistance: 4.8,
  cameraDrift: 0,
  cameraAudioKick: 0,
  cameraBeatPump: 0,
  cameraSway: 0,
  paceEnergy: 0.9,
  tempoInfluence: 0.5,
  flowSpeed: 1,
  smokePersist: 0.976,
  turbulence: 1,
  buoyancy: 0.7,
  smokeBlur: 0.4,
  bedDensity: 3,
  bedSize: 0.08,
  bassBloomSize: 0.6,
  bassPush: 1,
  bigFlashSize: 3,
  bigPush: 1,
  shards: true,
  cutouts: 2.6,
  lines: 3,
  lineAccent: 0.5,
  contrast: 1.5,
  grain: 0.75,
  dust: 0.7,
}

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
  uniform float uBlur;
  uniform vec2 uPush;
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

  // Domain-warped multi-octave curl: a big swirl whose sample point is itself
  // pushed around by noise, plus two finer octaves. That warp plus the octaves is
  // what turns a uniform drift into billowing plumes and fine filaments, the smoke
  // in the reference instead of drifting blobs.
  vec2 flowField(vec2 p) {
    vec2 warp = vec2(
      vnoise(p * 1.1 + uTime * 0.04),
      vnoise(p * 1.1 + 5.2 - uTime * 0.05)
    );
    vec2 f = curl(p * 1.5 + warp * 1.6 + uTime * 0.03);
    f += curl(p * 3.3 - warp * 0.8 + uTime * 0.05) * 0.5;
    f += curl(p * 7.0 + uTime * 0.08) * 0.25;
    return f;
  }

  void main() {
    vec2 flow = flowField(vUv * 3.0) * uTurb;
    flow.y -= uRise;
    // uPush is a whole-frame directional shove, set on a bass hit and decayed, so a
    // kick whips the entire buffer one way like a shockwave.
    vec2 uv = vUv + (flow + uPush) * uTexel;

    // Energy-preserving 5-tap blur (center 0.6, four neighbours 0.1) so trails
    // diffuse into smoke, mixed by uBlur against the unblurred sample: the smoke
    // buffer runs it full, the fast hit buffer keeps it crisp. Decay then bleeds
    // the whole thing toward black.
    vec3 c0 = texture2D(tPrev, uv).rgb;
    vec3 cb = c0 * 0.6;
    cb += texture2D(tPrev, uv + vec2(uTexel.x, 0.0)).rgb * 0.1;
    cb += texture2D(tPrev, uv - vec2(uTexel.x, 0.0)).rgb * 0.1;
    cb += texture2D(tPrev, uv + vec2(0.0, uTexel.y)).rgb * 0.1;
    cb += texture2D(tPrev, uv - vec2(0.0, uTexel.y)).rgb * 0.1;
    vec3 c = mix(c0, cb, uBlur);

    gl_FragColor = vec4(c * uDecay, 1.0);
  }
`

// Display pass: composite the two feedback buffers. Each holds a single signed ink
// density (all channels stay equal). Empty field is the background colour; the slow
// buffer's positive ink is smoke toward the accent, the fast buffer's positive ink
// is bright hits toward the foreground text colour, and either buffer's negative ink
// carves toward the darker background. Vignette and grain only touch the ink, so the
// flat background reads as exactly the theme background. uGrain throws a noise wash
// on the hits.
const DISPLAY_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tBg;
  uniform sampler2D tFg;
  uniform float uTime;
  uniform float uGrain;
  uniform float uContrast;
  uniform float uGrainScale;
  uniform float uDust;
  uniform vec3 uBg;
  uniform vec3 uAccent;
  uniform vec3 uDark;
  uniform vec3 uText;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }

  void main() {
    float db = texture2D(tBg, vUv).r;
    float df = texture2D(tFg, vUv).r;
    float bgP = max(db, 0.0);
    float bgN = max(-db, 0.0);
    float fgP = max(df, 0.0);
    float fgN = max(-df, 0.0);
    // Punchier response so the smoke fills bright and reads high-contrast like the
    // reference; blacks stay black.
    bgP = pow(bgP / (1.0 + bgP * 0.35), 0.72);
    bgN = pow(bgN / (1.0 + bgN * 0.6), 0.85);
    fgP = pow(fgP / (1.0 + fgP * 0.35), 0.72);
    fgN = pow(fgN / (1.0 + fgN * 0.6), 0.85);

    // Loose vignette, applied to the ink so the background stays uniform.
    vec2 q = vUv - 0.5;
    float vig = smoothstep(1.5, 0.1, dot(q, q) * 2.0);
    bgP = clamp(bgP * vig, 0.0, 1.0);
    bgN = clamp(bgN * vig, 0.0, 1.0);
    fgP = clamp(fgP * vig, 0.0, 1.0);
    fgN = clamp(fgN * vig, 0.0, 1.0);

    // Smoke first (accent), then the black cutouts carve toward near-black so they
    // tear visibly through the bright smoke, then the fast hits punch on top toward
    // the foreground text colour for the two-tone dynamic.
    vec3 col = uBg;
    col = mix(col, uAccent, bgP);
    col = mix(col, uBg * 0.12, clamp(bgN, 0.0, 1.0));
    col = mix(col, uText, fgP);
    col = mix(col, uDark, fgN);

    // Contrast pushed around the background colour.
    col = uBg + (col - uBg) * uContrast;

    // Grain: a base whisper, more inside the ink, plus a burst on uGrain so hits
    // throw a spray of noise; uGrainScale is the live knob.
    float ink = bgP + fgP;
    float g = hash(vUv * vec2(1920.0, 1080.0) + uTime) - 0.5;
    col += g * (0.01 + 0.04 * ink + 0.08 * uGrain * (0.3 + ink)) * uGrainScale;
    // Fine bright dust specks drifting through the ink, the reference's film-dust
    // sparkle. Sparse (step near 1), stepped in time so they twinkle rather than boil.
    float dust = step(0.9965, hash(vUv * vec2(2600.0, 1500.0) + floor(uTime * 24.0) * 1.7));
    col += dust * (0.25 + 0.5 * ink) * uDust;

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
    float r = length(uv) * 2.0; // 0 at center, 1 at the sprite edge
    if (r > 1.0) discard;
    float ang = atan(uv.y, uv.x);
    // Jagged radial reach: the burst extends different distances at different angles,
    // with sharp spikes, so the silhouette is a torn star, not a clean disc.
    float spike = fbm(vec2(ang * 5.0 + vSeed * 30.0, vSeed * 13.0));
    spike = pow(spike, 2.5);
    float reach = 0.3 + spike * 0.7;
    if (r > reach) discard;
    // Filament streaks running outward along the angle, for the shredded look.
    float streak = fbm(vec2(ang * 16.0 + vSeed * 50.0, r * 2.5));
    // Bright core falling toward the torn edge, broken up by cloud noise + streaks.
    float body = pow(max(0.0, 1.0 - r / reach), 1.5);
    float n = fbm(gl_PointCoord * 7.0 + vSeed * 40.0);
    float intensity = body * (0.3 + 0.7 * n + 0.5 * streak) * vBright;
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

  constructor(t: typeof THREE, private readonly count: number, mode: 'add' | 'sub', layer = 0) {
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
    this.points.layers.set(layer)
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

// Cheap deterministic hash of an integer vertex key plus a seed to a [-1, 1]^3
// offset, written into `out`. Keying on the rounded base position means every copy
// of a shared vertex gets the same shove, so a shard warps as one piece instead of
// tearing apart at the seams.
function hashOffset(out: THREE.Vector3, x: number, y: number, z: number, seed: number) {
  const a = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 43.123) * 43758.5453
  const b = Math.sin(x * 39.346 + y * 11.135 + z * 83.155 + seed * 12.113) * 24634.6345
  const c = Math.sin(x * 73.156 + y * 52.235 + z * 9.153 + seed * 7.777) * 15731.743
  out.set((a - Math.floor(a)) * 2 - 1, (b - Math.floor(b)) * 2 - 1, (c - Math.floor(c)) * 2 - 1)
}

// A pool of wireframe polyhedra that punctuate the big hits. On a heavy kick one is
// dropped into the field with its vertices shoved around by the hash above, lit
// bright, then decayed out over a few frames while it spins and swells. The feedback
// buffer smears it as it appears and moves, so a drop throws a torn cage of light
// that dissolves into the smoke. Additive white, tonemapped to the accent like the
// splotches and lines.
class ShardLayer {
  readonly group: THREE.Group
  private readonly meshes: THREE.Mesh[] = []
  private readonly mats: THREE.MeshBasicMaterial[] = []
  // Undistorted base positions per mesh, so each hit warps from the clean shape.
  private readonly bases: Float32Array[] = []
  // Remaining life per mesh, 1 on spawn down to 0, and a per-mesh spin speed.
  private readonly life: Float32Array
  private readonly spin: Float32Array
  private readonly scratch: THREE.Vector3
  private cursor = 0

  constructor(t: typeof THREE, private readonly count: number, layer = 0) {
    this.group = new t.Group()
    this.scratch = new t.Vector3()
    this.life = new Float32Array(count)
    this.spin = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const geo = new t.IcosahedronGeometry(1, 0)
      const pos = geo.getAttribute('position') as THREE.BufferAttribute
      pos.setUsage(t.DynamicDrawUsage)
      this.bases.push((pos.array as Float32Array).slice())
      const mat = new t.MeshBasicMaterial({
        color: 0x000000,
        wireframe: true,
        transparent: true,
        blending: t.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      })
      const mesh = new t.Mesh(geo, mat)
      mesh.frustumCulled = false
      mesh.visible = false
      mesh.layers.set(layer)
      this.meshes.push(mesh)
      this.mats.push(mat)
      this.group.add(mesh)
    }
  }

  // Drop a shard at `pos`. `strength` scales its size and distortion; `seed` varies
  // the warp so no two look alike.
  emit(pos: THREE.Vector3, strength: number, seed: number) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.count
    const mesh = this.meshes[i]!
    const base = this.bases[i]!
    const attr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    const amp = 0.3 + strength * 0.55
    for (let v = 0; v < arr.length; v += 3) {
      const bx = base[v]!
      const by = base[v + 1]!
      const bz = base[v + 2]!
      hashOffset(this.scratch, Math.round(bx * 8), Math.round(by * 8), Math.round(bz * 8), seed)
      arr[v] = bx + this.scratch.x * amp
      arr[v + 1] = by + this.scratch.y * amp
      arr[v + 2] = bz + this.scratch.z * amp
    }
    attr.needsUpdate = true
    mesh.position.copy(pos)
    mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28)
    mesh.scale.setScalar(0.8 + strength * 1.8)
    this.spin[i] = (Math.random() - 0.5) * 3
    this.life[i] = 1
    mesh.visible = true
  }

  // Advance every live shard: spin, swell a touch, and fall the light out over a few
  // frames. Brightness is life squared so it snaps to full on spawn then eases off,
  // reading as a hard flash-in that dissolves.
  update(step: number) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i]! <= 0)
        continue
      this.life[i]! -= step * 5
      const l = this.life[i]!
      const mesh = this.meshes[i]!
      if (l <= 0) {
        mesh.visible = false
        this.mats[i]!.color.setScalar(0)
        continue
      }
      mesh.rotation.y += this.spin[i]! * step
      mesh.rotation.x += this.spin[i]! * step * 0.5
      mesh.scale.multiplyScalar(1 + step * 0.9)
      this.mats[i]!.color.setScalar(l * l * 1.4)
    }
  }

  dispose() {
    for (let i = 0; i < this.count; i++) {
      this.meshes[i]!.geometry.dispose()
      this.mats[i]!.dispose()
    }
  }
}

// A pool of long streak lines that flash for a single frame on a sharp hit, then
// the feedback buffer drags them off the edges. Per-vertex colour lets one segment
// light while the rest stay dark. 'add' lights the smoke (accent), 'sub'
// reverse-subtracts (cutout), so the engine can keep one of each and pick per hit.
class LineLayer {
  readonly lines: THREE.LineSegments
  private readonly mat: THREE.LineBasicMaterial
  private readonly aPos: THREE.BufferAttribute
  private readonly aCol: THREE.BufferAttribute
  private readonly col: Float32Array
  private readonly lit: Uint8Array
  private cursor = 0

  constructor(t: typeof THREE, private readonly count: number, mode: 'add' | 'sub', layer: number) {
    const geo = new t.BufferGeometry()
    this.col = new Float32Array(count * 2 * 3)
    this.lit = new Uint8Array(count)
    this.aPos = new t.BufferAttribute(new Float32Array(count * 2 * 3), 3)
    this.aCol = new t.BufferAttribute(this.col, 3)
    this.aPos.setUsage(t.DynamicDrawUsage)
    this.aCol.setUsage(t.DynamicDrawUsage)
    geo.setAttribute('position', this.aPos)
    geo.setAttribute('color', this.aCol)
    this.mat = new t.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false })
    if (mode === 'add') {
      this.mat.blending = t.AdditiveBlending
    }
    else {
      this.mat.blending = t.CustomBlending
      this.mat.blendEquation = t.ReverseSubtractEquation
      this.mat.blendSrc = t.OneFactor
      this.mat.blendDst = t.OneFactor
    }
    this.lines = new t.LineSegments(geo, this.mat)
    this.lines.frustumCulled = false
    this.lines.layers.set(layer)
  }

  // Black out any segment lit last frame. Returns whether the colour buffer changed.
  clearLit(): boolean {
    let dirty = false
    for (let i = 0; i < this.count; i++) {
      if (this.lit[i]) {
        this.lit[i] = 0
        this.col.fill(0, i * 6, i * 6 + 6)
        dirty = true
      }
    }
    return dirty
  }

  // Light one segment: a long streak anchored at `a`, running along `b` far enough
  // to leave the frame both ways, held at `bright` for this frame only.
  fire(a: THREE.Vector3, b: THREE.Vector3, half: number, bright: number) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.count
    this.aPos.setXYZ(i * 2, a.x - b.x * half, a.y - b.y * half, a.z - b.z * half)
    this.aPos.setXYZ(i * 2 + 1, a.x + b.x * half, a.y + b.y * half, a.z + b.z * half)
    this.col.fill(bright, i * 6, i * 6 + 6)
    this.lit[i] = 1
    this.aPos.needsUpdate = true
  }

  flush() {
    this.aCol.needsUpdate = true
  }

  dispose() {
    this.lines.geometry.dispose()
    this.mat.dispose()
  }
}

export class SmokeField {
  private readonly THREE: typeof THREE
  // Live tuning, mutated in place by setConfig so the next frame reads new values.
  private readonly cfg: SmokeConfig
  private readonly renderer: THREE.WebGLRenderer
  private readonly camera: THREE.PerspectiveCamera
  private readonly scene: THREE.Scene
  private readonly worldGroup: THREE.Group

  private readonly quadScene: THREE.Scene
  private readonly quadCam: THREE.OrthographicCamera
  private readonly advectMat: THREE.ShaderMaterial
  private readonly displayMat: THREE.ShaderMaterial

  // Two feedback buffer pairs: a slow one that holds the persistent smoke, and a
  // fast one that holds the sharp hits so they pop and vanish.
  private bgA: THREE.WebGLRenderTarget
  private bgB: THREE.WebGLRenderTarget
  private fgA: THREE.WebGLRenderTarget
  private fgB: THREE.WebGLRenderTarget

  // White (additive) and black (subtractive) splotch pools drive the background
  // smoke. The flash pool is additive too but lives in the fast foreground buffer,
  // for bright hits that snap in and clear.
  private readonly white: SplotchLayer
  private readonly black: SplotchLayer
  private readonly flash: SplotchLayer
  // Distorted wireframe shards flashed in on the biggest hits.
  private readonly shards: ShardLayer

  // Two streak-line pools on the background layer: one additive (accent) and one
  // reverse-subtract (cutout). Each hit fires into one or the other per lineAccent.
  private readonly linesAccent: LineLayer
  private readonly linesCut: LineLayer

  // Camera orbit state: angles, angular velocity, and a kick the music adds to.
  private theta = 0
  private phi = 0.2
  private thetaVel = 0.04
  private phiVel = 0.0
  private radius = 6

  // Smoothed style state so the look glides between moods.
  private turb = 3
  // Background feedback decay (near 1, so smoke persists), foreground decay (well
  // below 1, so hits vanish fast), plus the rise/swirl/time the passes read.
  private bgDecay = 0.97
  private fgDecay = 0.86
  private rise = 1.2
  private beatSwirl = 0
  private time = 0
  // Paced clock for the advection flow and world sway, so motion follows the song
  // rather than real time. Advances by pace each frame.
  private flowTime = 0
  // Directional shove of the smoke buffer, a shockwave set on a bass hit and decayed
  // over a few frames so the whole frame lurches in one direction.
  private pushX = 0
  private pushY = 0
  private brushPhase = 1
  // Horizontal spread so the cloud fills a wide frame instead of a centred
  // square. Set from the aspect ratio in resize.
  private spreadX = 1
  // Rising-edge latches: emit one burst / flash per detected hit instead of
  // every frame the feature sits above threshold.
  // Bass trigger, adaptive per song. bassBaseline tracks the onset floor between kicks
  // (falls fast, rises slow so kick peaks don't drag it up); bassPeak tracks the
  // recent kick height above that floor. We fire when a kick clears half the recent
  // height, so a dense/compressed mix whose kick barely lifts the spectrum still
  // triggers and a dynamic one stays clean, without a fixed threshold that fits
  // neither. bassArmed is the build-up-and-release latch.
  private bassArmed = true
  private bassBaseline = 0
  private bassPeak = 0.3
  private highHeld = false
  private lineHeld = false
  // Last frame's beat phase, so we can catch the wrap to 0 as a downbeat.
  private prevBeatPhase = 0
  // Smoothed beat-breathing envelope, 0..1, peaks on the downbeat. Drives the
  // camera pump and the beat swirl so the motion tracks the tempo.
  private beatPulse = 0
  // Smoothed loudness of the passage: a plain EMA of the raw level, not the
  // adaptively-normalized features. Gates emission so quiet parts stay calm.
  private drive = 0
  // Slow peak-holding loudness reference, so the gate keys on loud-vs-quiet for
  // this track rather than an absolute level. Leaks down to recalibrate.
  private loudRef = 0
  private readonly scratch: THREE.Vector3
  private readonly scratch2: THREE.Vector3

  private width = 1
  private height = 1
  private pixelRatio = 1
  private disposed = false

  private constructor(t: typeof THREE, canvas: HTMLCanvasElement, colors: SmokeColors, config: SmokeConfig) {
    this.THREE = t
    this.cfg = config
    this.scratch = new t.Vector3()
    this.scratch2 = new t.Vector3()

    const renderer = new t.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' })
    renderer.autoClear = true
    renderer.setClearColor(new t.Color(colors.bg[0], colors.bg[1], colors.bg[2]), 1)
    this.renderer = renderer

    // Far plane pushed way out so the very long streak lines (~20k units) aren't
    // clipped at the far plane and end mid-frame; the render targets carry no depth
    // buffer, so the deep range costs no precision.
    this.camera = new t.PerspectiveCamera(55, 1, 0.1, 50000)
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
        uBlur: { value: 1 },
        uPush: { value: new t.Vector2(0, 0) },
      },
    })
    this.displayMat = new t.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: DISPLAY_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tBg: { value: null },
        tFg: { value: null },
        uTime: { value: 0 },
        uGrain: { value: 0 },
        uContrast: { value: 1 },
        uGrainScale: { value: 1 },
        uDust: { value: 1 },
        uBg: { value: new t.Vector3(colors.bg[0], colors.bg[1], colors.bg[2]) },
        uAccent: { value: new t.Vector3(colors.accent[0], colors.accent[1], colors.accent[2]) },
        uDark: { value: new t.Vector3(colors.dark[0], colors.dark[1], colors.dark[2]) },
        uText: { value: new t.Vector3(colors.text[0], colors.text[1], colors.text[2]) },
      },
    })
    this.quadScene.add(new t.Mesh(quadGeo, this.advectMat))

    this.bgA = this.makeTarget(1, 1)
    this.bgB = this.makeTarget(1, 1)
    this.fgA = this.makeTarget(1, 1)
    this.fgB = this.makeTarget(1, 1)

    // Background pools: black draws first so white can light over the cutouts. Both
    // sit on the background layer, composited through the slow smoke buffer.
    this.black = new SplotchLayer(t, MAX_CUTOUTS, 'sub', LAYER_BG)
    this.white = new SplotchLayer(t, MAX_SPLOTCHES, 'add', LAYER_BG)
    this.worldGroup.add(this.black.points)
    this.worldGroup.add(this.white.points)

    // Flash pool on the foreground layer: bright bloom stamps for the big hits and
    // the crisp high sparkles, composited through the fast buffer so they snap off.
    this.flash = new SplotchLayer(t, MAX_SPLOTCHES, 'add', LAYER_FG)
    this.worldGroup.add(this.flash.points)

    // Shards on the background layer, so they read accent-coloured and smear into
    // the smoke like the reference geometry, their own group so they parallax with
    // the rest of the world.
    this.shards = new ShardLayer(t, MAX_SHARDS, LAYER_BG)
    this.worldGroup.add(this.shards.group)

    // Streak lines: an accent (additive) pool and a cutout (reverse-subtract) pool,
    // both on the background layer so they draw into the smoke buffer.
    this.linesAccent = new LineLayer(t, MAX_LINES, 'add', LAYER_BG)
    this.linesCut = new LineLayer(t, MAX_LINES, 'sub', LAYER_BG)
    this.worldGroup.add(this.linesAccent.lines)
    this.worldGroup.add(this.linesCut.lines)
  }

  // Build the engine, or null if WebGL isn't available so the caller can fall
  // back to an empty panel.
  static async create(canvas: HTMLCanvasElement, colors: SmokeColors, config: SmokeConfig): Promise<SmokeField | null> {
    try {
      const t = await import('three')
      // Probe for a working context before committing.
      const probe = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
      if (!probe)
        return null
      return new SmokeField(t, canvas, colors, config)
    }
    catch {
      return null
    }
  }

  // Apply live tuning from the settings panel. Mutates the shared config in place so
  // the next frame reads the new values, no rebuild.
  setConfig(partial: Partial<SmokeConfig>) {
    Object.assign(this.cfg, partial)
  }

  // Re-point the palette at the current theme (called when light/dark flips).
  setColors(colors: SmokeColors) {
    if (this.disposed)
      return
    const t = this.THREE
    ;(this.displayMat.uniforms.uBg!.value as THREE.Vector3).set(colors.bg[0], colors.bg[1], colors.bg[2])
    ;(this.displayMat.uniforms.uAccent!.value as THREE.Vector3).set(colors.accent[0], colors.accent[1], colors.accent[2])
    ;(this.displayMat.uniforms.uDark!.value as THREE.Vector3).set(colors.dark[0], colors.dark[1], colors.dark[2])
    ;(this.displayMat.uniforms.uText!.value as THREE.Vector3).set(colors.text[0], colors.text[1], colors.text[2])
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
    this.bgA.setSize(bw, bh)
    this.bgB.setSize(bw, bh)
    this.fgA.setSize(bw, bh)
    this.fgB.setSize(bw, bh)
    ;(this.advectMat.uniforms.uTexel!.value as THREE.Vector2).set(1 / bw, 1 / bh)
    this.white.setPixelRatio(pr)
    this.black.setPixelRatio(pr)
    this.flash.setPixelRatio(pr)

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    // Bias emitter spread toward the wide axis so the cloud fills a wide panel to
    // the sides instead of clustering in a centred disc. Over-spread (aspect x 1.3)
    // so the mid-radius particles reach the horizontal edges, not just the sparse
    // outermost ones. Only the position moves, so the blobs stay round.
    this.spreadX = Math.max(1, this.camera.aspect * 1.3)
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

    // Beat breathing: with a tempo locked, a smooth envelope that peaks on the
    // downbeat and eases to a trough mid-beat (a raised cosine of the beat phase,
    // continuous across the wrap). Zero when there's no tempo, lightly smoothed so
    // locking on or dropping out doesn't jerk. Drives the camera pump and a little
    // extra swirl below, so the field moves in time, not only on the downbeat burst.
    const beatTarget = f.bpm > 0 ? 0.5 + 0.5 * Math.cos(f.beatPhase * Math.PI * 2) : 0
    this.beatPulse += (beatTarget - this.beatPulse) * 0.3

    // --- Motion pace. Tie the whole thing to the song: near-still in silence, slow
    // in quiet or slow-tempo parts, churning on loud fast drops. tempoRate
    // normalizes BPM around 120; pace folds in loudness and floors near 0 so a silent
    // field settles instead of swirling forever. The flow clock, swirl strength, and
    // camera all scale by these. ---
    const rawTempo = f.bpm > 0 ? Math.min(1.4, Math.max(0.55, f.bpm / 120)) : 0.9
    // tempoInfluence blends between "ignore tempo" (1) and "fully paced by BPM".
    const tempoRate = 1 + (rawTempo - 1) * this.cfg.tempoInfluence
    const pace = Math.max(0.04, (0.1 + f.energy * this.cfg.paceEnergy) * tempoRate)
    // Flow clock: advances with pace, so the advection swirl evolves and drifts only
    // as fast as the music moves, not at a fixed real-time rate.
    this.flowTime += step * (0.2 + pace * 1.1) * this.cfg.flowSpeed

    // --- Dynamics gate (computed first, since turbulence below thresholds on it).
    // The band and onset features are adaptively normalized, so a soft kick in a
    // quiet breakdown reads as loud as one in a drop. Track the raw level instead
    // (NOT adaptively normalized) as the passage's loudness: attack fast so a drop
    // opens up right away, release slow so it settles. ---
    this.drive += (f.level - this.drive) * (f.level > this.drive ? 0.2 : 0.05)
    // Key the gate on where we sit in THIS track's loudness range, not an absolute
    // number: level's log scale rarely climbs near 1. loudRef holds the recent peak
    // and leaks down to recalibrate; rel is 0..1 within that range.
    this.loudRef = Math.max(this.drive, this.loudRef * 0.9997)
    const rel = this.loudRef > 1e-3 ? this.drive / this.loudRef : 0
    const gate = Math.max(0, Math.min(1, (rel - 0.3) / 0.4))
    // quiet raises every hit threshold, gate shrinks what slips through, so a
    // breakdown stays calm and the busy look is earned by a loud section.
    const quiet = 1 - gate
    // Low-intensity factor: 1 in quiet passages, 0 as the mix gets loud. Drives the
    // dust, which belongs only to the calm parts.
    const lowFactor = Math.max(0, 1 - gate * 1.8)

    // --- Style state. The two buffers get very different decays: background smoke
    // rides long trails so it lingers (near 1), foreground clears fast so hits pop
    // and vanish. Turbulence is thresholded on volume: calm until the mix is in the
    // top of its own loudness range (gate > 0.9), then it surges, so only drops churn
    // the smoke. ---
    const targetBgDecay = this.cfg.smokePersist + f.flow * 0.02 - f.splatter * 0.008
    const loudSurge = Math.max(0, (gate - 0.9) / 0.1)
    const targetTurb = (0.6 + loudSurge * 3.5 + f.splatter * 1.6) * tempoRate * this.cfg.turbulence
    this.bgDecay += (targetBgDecay - this.bgDecay) * 0.1
    this.turb += (targetTurb - this.turb) * 0.1
    // Foreground vanishes quick, a touch quicker when busy so hits don't pile up.
    this.fgDecay = 0.86 - f.splatter * 0.06
    this.rise = (0.4 + f.energy * 1.2) * tempoRate * this.cfg.buoyancy
    // A gentle beat term on the swirl so the smoke breathes on the beat.
    this.beatSwirl = this.beatPulse * f.energy * 1.0
    this.time = time
    this.displayMat.uniforms.uTime!.value = time

    // Noise wash: drive the display grain up with the transients so hits throw a
    // spray of noise like the reference, gated so quiet parts stay clean.
    this.displayMat.uniforms.uGrain!.value = Math.min(1, f.onset * 0.6 + f.bassHit * 0.5 + f.highHit * 0.4) * gate
    this.displayMat.uniforms.uContrast!.value = this.cfg.contrast
    this.displayMat.uniforms.uGrainScale!.value = this.cfg.grain
    // Dust sparkle rides the low-intensity factor too, so it fades out on drops.
    this.displayMat.uniforms.uDust!.value = this.cfg.dust * lowFactor

    // Dust bed: tiny light specks that belong to the QUIET passages only. lowFactor
    // is high when the mix sits low in its range and hits 0 as it gets loud, so the
    // moment a drop lands the dust stops and it's all smoke and hits. Emitted into
    // the white pool, so it lights the smoke, never a dark cutout.
    const bedCount = Math.round(8 * this.cfg.bedDensity * lowFactor)
    for (let n = 0; n < bedCount; n++) {
      shellPoint(this.scratch, 0.6 + Math.random() * 2.8)
      this.scratch.x *= this.spreadX
      this.white.emit(this.scratch, this.cfg.bedSize * (0.7 + Math.random() * 0.9), 0.18 + lowFactor * 0.2)
    }

    // --- Emitters ---
    // Bass hits, adaptively detected. A fixed threshold whole songs never cross when
    // the mix is dense (the kick barely lifts an already-loud spectrum, so the flux
    // stays low); track the onset floor and the recent kick height above it instead,
    // and fire when a kick clears half that height. Calibrates to each track in
    // ~1-2s. Still build-up-and-release (re-arm below a lower level) and still needs
    // real low-band energy so a phantom frequency can't trip it. A kick shoves the
    // buffer; the hardest ones throw a shard and kick the camera on this same
    // trigger, so geometry and camera move together.
    const above = f.bassHit - this.bassBaseline
    this.bassBaseline += above < 0 ? above * 0.2 : above * 0.01
    this.bassPeak = Math.max(above, this.bassPeak * 0.997)
    const fireLevel = this.bassBaseline + this.bassPeak * 0.5
    const rearmLevel = this.bassBaseline + this.bassPeak * 0.2
    const bassEnergy = f.bands.sub + f.bands.bass
    if (this.bassArmed && f.bassHit > fireLevel && bassEnergy > 0.15) {
      this.bassArmed = false
      const s = f.bassHit
      // "hard" is relative too: a kick near the top of the recent range, only in a
      // loud section, so shards punctuate drops rather than every bar.
      const hard = above > this.bassPeak * 0.85 && gate > 0.4
      // Shove the whole smoke buffer, a shockwave off the kick.
      const ang = Math.random() * Math.PI * 2
      const mag = (6 + s * 16) * gate * this.cfg.bassPush * (hard ? this.cfg.bigPush * 1.6 : 1)
      this.pushX = Math.cos(ang) * mag
      this.pushY = Math.sin(ang) * mag
      if (hard) {
        if (this.cfg.shards) {
          shellPoint(this.scratch, 1.0 + Math.random() * 1.2)
          this.scratch.x *= this.spreadX
          this.shards.emit(this.scratch, s, Math.random() * 100)
        }
        this.thetaVel += (Math.random() - 0.5) * s * this.cfg.cameraAudioKick
        this.phiVel += (Math.random() - 0.5) * s * this.cfg.cameraAudioKick * 0.6
      }
    }
    // Re-arm once the kick has released back toward the floor.
    if (f.bassHit < rearmLevel)
      this.bassArmed = true

    // High hits: small black cutouts carving detail, with a couple of tiny white
    // sparkles riding along, so snares/hats add lots of little fighting bits.
    // High hits: crisp white sparkles on the fast foreground layer for hats/snares,
    // no black dots. Requires real high-band energy so a track with no top end can't
    // false-fire.
    const highHit = f.highHit > 0.38 + quiet * 0.4 && (f.bands.high + f.bands.air) > 0.2
    if (highHit && !this.highHeld) {
      const h = f.highHit
      this.emitBurst(this.flash, Math.round((1 + h * 3) * gate), h * 0.9 * gate, 3.8, 0.14)
    }
    this.highHeld = highHit

    // Beat pulse: when a tempo is locked, the phase wrapping past 1 marks a downbeat.
    // Stamp a soft white burst on it so the field breathes with the beat even through
    // a stretch with no sharp transient, but hold off while it's quiet.
    if (f.bpm > 0) {
      if (f.beatPhase < this.prevBeatPhase && gate > 0.15) {
        const s = (0.4 + f.energy * 0.6) * gate
        this.emitBurst(this.white, 2, s, 3.2, 0.8)
      }
      this.prevBeatPhase = f.beatPhase
    }
    else {
      this.prevBeatPhase = 0
    }

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

    // Decay the pools. Busier passages fade faster so the screen clears. The flash
    // pool decays hardest so the foreground hits snap off.
    const splotchDecay = Math.exp(-step * (5 + f.splatter * 8))
    this.white.decay(splotchDecay)
    this.black.decay(Math.exp(-step * (6 + f.splatter * 8)))
    this.flash.decay(Math.exp(-step * 16))

    // The directional shove decays over a few frames so the lurch whips then settles.
    this.pushX *= 0.82
    this.pushY *= 0.82

    // Advance any live shards: spin, swell, and fall their light out.
    this.shards.update(step)

    // Streak lines. Dark at rest; on a sharp hit (rising edge, thinned out so they
    // only flash in now and then) one segment lights for a single frame, then the
    // feedback buffer drags it off. First, black out whatever was lit last frame in
    // both pools.
    const accentDirty = this.linesAccent.clearLit()
    const cutDirty = this.linesCut.clearLit()
    let firedAccent = false
    let firedCut = false
    // Geometry mood (sharp, fast, bright) makes the streaks trigger-happy: lower the
    // threshold and raise the flash odds, so a busy bright passage lances lines often
    // while a calm one almost never does.
    const lineHit = f.highHit > 0.55 - f.geometry * 0.2 + quiet * 0.3
    if (lineHit && !this.lineHeld && Math.random() < (0.4 + f.geometry * 0.5) * gate * this.cfg.lines) {
      // Random anchor and direction; endpoints thrown way off screen (~100x the
      // frame) so the streak always runs clean off both sides no matter the
      // orientation or aspect ratio, never ending mid-frame. The frustum clips the
      // far ends off screen. lineAccent decides whether this streak lights or cuts.
      shellPoint(this.scratch, Math.random() * 2.5)
      shellPoint(this.scratch2, 1)
      const half = 6000 + Math.random() * 16000
      const bright = 0.6 + f.highHit * 0.6
      if (Math.random() < this.cfg.lineAccent) {
        this.linesAccent.fire(this.scratch, this.scratch2, half, bright)
        firedAccent = true
      }
      else {
        this.linesCut.fire(this.scratch, this.scratch2, half, bright)
        firedCut = true
      }
    }
    this.lineHeld = lineHit
    if (accentDirty || firedAccent)
      this.linesAccent.flush()
    if (cutDirty || firedCut)
      this.linesCut.flush()

    // The 3D field itself moves, and this (not the screen swirl) is the main motion
    // that drags the smoke: it orbits and sways in world space, scaled by pace so it
    // slows in quiet or slow-tempo parts and nearly stills in silence. Phases run off
    // the flow clock so everything shares one paced timebase.
    this.worldGroup.rotation.y += step * this.cfg.cameraDrift * (0.3 + pace)
    this.worldGroup.rotation.x += step * this.cfg.cameraDrift * 0.4 * (0.3 + pace)
    const sway = this.cfg.cameraSway * pace
    this.worldGroup.position.set(
      Math.sin(this.flowTime * 0.5) * sway,
      Math.cos(this.flowTime * 0.4) * sway * 0.7,
      Math.sin(this.flowTime * 0.3) * sway * 0.6,
    )

    // --- Camera: paced idle drift only. The audio kick fires up in the bass trigger,
    // on the same hard-kick threshold as the geometry, so camera and shards move
    // together. The base drift scales with pace so a quiet song orbits slowly. ---
    this.thetaVel += (this.cfg.cameraDrift * (0.3 + pace) - this.thetaVel) * 0.02
    this.phiVel *= 1 - step * 1.2
    this.theta += this.thetaVel * step
    this.phi += this.phiVel * step
    this.phi = Math.max(-1.2, Math.min(1.2, this.phi))
    // The energy dolly is part of the audio reactivity, so gate it by cameraAudioKick
    // too: at 0 the distance holds steady instead of drifting with the loudness.
    this.radius += ((this.cfg.cameraDistance - f.energy * 1.2 * this.cfg.cameraAudioKick) - this.radius) * 0.02
    // Pump the orbit inward on each beat and let it back out, scaled by energy so a
    // quiet passage doesn't bob. cameraBeatPump is the knob; applied on top of the
    // slow base radius, which lerps far too slowly to track a beat on its own.
    const radius = this.radius - this.beatPulse * this.cfg.cameraBeatPump * (1 + f.energy * 3)

    const cp = Math.cos(this.phi)
    this.camera.position.set(
      Math.sin(this.theta) * cp * radius,
      Math.sin(this.phi) * radius,
      Math.cos(this.theta) * cp * radius,
    )
    this.camera.lookAt(0, 0, 0)

    this.render()
  }

  private render() {
    const r = this.renderer
    const a = this.advectMat.uniforms
    // The advect flow animates off the paced clock, so the swirl slows with the song
    // instead of running at a fixed real-time rate.
    a.uTime!.value = this.flowTime

    // 1) Background smoke: advect slow, full blur and swirl, then add the
    // background-layer scene on top. This buffer persists, so it reads as smoke.
    a.tPrev!.value = this.bgA.texture
    a.uDecay!.value = this.bgDecay
    a.uTurb!.value = this.turb + this.beatSwirl
    a.uRise!.value = this.rise
    a.uBlur!.value = this.cfg.smokeBlur
    ;(a.uPush!.value as THREE.Vector2).set(this.pushX, this.pushY)
    this.setQuadMaterial(this.advectMat)
    r.autoClear = true
    r.setRenderTarget(this.bgB)
    r.render(this.quadScene, this.quadCam)
    r.autoClear = false
    this.camera.layers.set(LAYER_BG)
    r.render(this.scene, this.camera)
    r.autoClear = true

    // 2) Foreground hits: advect fast, barely any blur or swirl, then add the
    // foreground-layer scene. This buffer clears quick, so hits pop and vanish.
    a.tPrev!.value = this.fgA.texture
    a.uDecay!.value = this.fgDecay
    a.uTurb!.value = this.turb * 0.35
    a.uRise!.value = this.rise * 0.4
    a.uBlur!.value = 0.25
    ;(a.uPush!.value as THREE.Vector2).set(0, 0)
    this.setQuadMaterial(this.advectMat)
    r.autoClear = true
    r.setRenderTarget(this.fgB)
    r.render(this.quadScene, this.quadCam)
    r.autoClear = false
    this.camera.layers.set(LAYER_FG)
    r.render(this.scene, this.camera)
    r.autoClear = true

    // 3) Composite both buffers to the screen.
    this.displayMat.uniforms.tBg!.value = this.bgB.texture
    this.displayMat.uniforms.tFg!.value = this.fgB.texture
    this.setQuadMaterial(this.displayMat)
    r.setRenderTarget(null)
    r.render(this.quadScene, this.quadCam)

    // Swap both pairs: the B targets are now the freshest accumulations.
    let tmp = this.bgA
    this.bgA = this.bgB
    this.bgB = tmp
    tmp = this.fgA
    this.fgA = this.fgB
    this.fgB = tmp
  }

  private setQuadMaterial(mat: THREE.ShaderMaterial) {
    const mesh = this.quadScene.children[0] as THREE.Mesh
    mesh.material = mat
  }

  dispose() {
    if (this.disposed)
      return
    this.disposed = true
    this.bgA.dispose()
    this.bgB.dispose()
    this.fgA.dispose()
    this.fgB.dispose()
    this.white.dispose()
    this.black.dispose()
    this.flash.dispose()
    this.advectMat.dispose()
    this.displayMat.dispose()
    this.linesAccent.dispose()
    this.linesCut.dispose()
    this.shards.dispose()
    ;(this.quadScene.children[0] as THREE.Mesh).geometry.dispose()
    this.renderer.dispose()
  }
}
