<script setup lang="ts">
const canvas = ref<HTMLCanvasElement | null>(null)

// Tuning
const PARTICLE_COUNT = 250
const FRICTION = 0.97
const MAX_SPEED = 1000
const TRAIL_DECAY = 0.92
const ATTRACT_STRENGTH = 3
const REPEL_RADIUS = 64
const REPEL_STRENGTH = 3.2
const TURBULENCE = 0.1
const NOISE_SCALE = 0.0015
const NOISE_SPEED = 0.00035

// Mouse
const mouse = { x: 0, y: 0, left: false, right: false }

type AccentVariant = 'accent' | 'raised' | 'lowered'

interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  baseRadius: number
  variant: AccentVariant
}

let animFrame: number
let particles: Particle[] = []
let t = 0

// Two persistent offscreen canvases for ping-pong trail
let bufA: OffscreenCanvas | null = null
let bufB: OffscreenCanvas | null = null
let ctxA: OffscreenCanvasRenderingContext2D | null = null
let ctxB: OffscreenCanvasRenderingContext2D | null = null

// Resolved accent colors
const colors: Record<AccentVariant, string> = {
  accent: '#a7fc2f',
  raised: '#69b103',
  lowered: '#4e8502',
}

const VARIANTS: AccentVariant[] = ['accent', 'raised', 'lowered']

function resolveColors() {
  const style = getComputedStyle(document.documentElement)
  colors.accent = style.getPropertyValue('--color-accent').trim() || colors.accent
  colors.raised = style.getPropertyValue('--color-bg-accent-raised').trim() || colors.raised
  colors.lowered = style.getPropertyValue('--color-bg-accent-lowered').trim() || colors.lowered
}

// Value noise grid for flow field
const GRID = 64
const noiseGrid: number[] = Array.from(
  { length: (GRID + 1) * (GRID + 1) },
  () => Math.random() * Math.PI * 4,
)

function lerp(a: number, b: number, f: number) {
  return a + (b - a) * f
}

function smoothstep(f: number) {
  return f * f * (3 - 2 * f)
}

function noiseAngle(x: number, y: number, time: number): number {
  const nx = x * NOISE_SCALE
  const ny = y * NOISE_SCALE
  const ix = Math.floor(nx) & (GRID - 1)
  const iy = Math.floor(ny) & (GRID - 1)
  const fx = smoothstep(nx - Math.floor(nx))
  const fy = smoothstep(ny - Math.floor(ny))
  const idx = (gx: number, gy: number) => (gy & (GRID - 1)) * (GRID + 1) + (gx & (GRID - 1))
  const a = noiseGrid[idx(ix, iy)]!
  const b = noiseGrid[idx(ix + 1, iy)]!
  const c = noiseGrid[idx(ix, iy + 1)]!
  const d = noiseGrid[idx(ix + 1, iy + 1)]!
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy) + time * Math.PI * 2
}

function createParticles(w: number, h: number) {
  particles = Array.from({ length: PARTICLE_COUNT }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    z: Math.random(),
    vx: 0,
    vy: 0,
    baseRadius: Math.random() * 14 + 8,
    variant: VARIANTS[Math.floor(Math.random() * VARIANTS.length)]!,
  }))
}

function tick(ctx: CanvasRenderingContext2D, w: number, h: number) {
  t += NOISE_SPEED

  if (!ctxA || !ctxB || !bufA || !bufB)
    return

  // Step 1: clear bufB, draw bufA (previous frame) at reduced alpha into bufB
  ctxB.clearRect(0, 0, w, h)
  ctxB.globalAlpha = TRAIL_DECAY
  ctxB.drawImage(bufA, 0, 0)
  ctxB.globalAlpha = 1

  // Step 2: update + draw particles into bufB on top of the faded trail
  particles.sort((a, b) => a.z - b.z)

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!
    const depthScale = 0.3 + p.z * 0.7

    // Flow field turbulence
    const angle = noiseAngle(p.x, p.y, t)
    p.vx += Math.cos(angle) * TURBULENCE * depthScale
    p.vy += Math.sin(angle) * TURBULENCE * depthScale

    // Nudge away from edges to prevent turbulence pinning particles to boundaries
    const margin = 60
    const edgeStrength = 0.15
    if (p.x < margin)
      p.vx += (margin - p.x) / margin * edgeStrength
    if (p.x > w - margin)
      p.vx -= (p.x - (w - margin)) / margin * edgeStrength
    if (p.y < margin)
      p.vy += (margin - p.y) / margin * edgeStrength
    if (p.y > h - margin)
      p.vy -= (p.y - (h - margin)) / margin * edgeStrength

    // Left click attracts, right click repulses - strength falls off with distance
    if (mouse.left || mouse.right) {
      const dx = mouse.x - p.x
      const dy = mouse.y - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 1) {
        const dir = mouse.left ? 1 : -1
        const falloff = ATTRACT_STRENGTH / (1 + dist * 0.01)
        p.vx += (dx / dist) * falloff * depthScale * dir
        p.vy += (dy / dist) * falloff * depthScale * dir
      }
    }

    // Repel from nearby particles in same depth layer
    for (let j = i + 1; j < particles.length; j++) {
      const q = particles[j]!
      if (Math.abs(p.z - q.z) > 0.35)
        continue
      const dx = p.x - q.x
      const dy = p.y - q.y
      const distSq = dx * dx + dy * dy
      const minDist = REPEL_RADIUS * (0.5 + p.z * 0.5)
      if (distSq < minDist * minDist && distSq > 0) {
        const dist = Math.sqrt(distSq)
        const force = ((minDist - dist) / minDist) * REPEL_STRENGTH
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        p.vx += fx
        p.vy += fy
        q.vx -= fx
        q.vy -= fy
      }
    }

    p.vx *= FRICTION
    p.vy *= FRICTION

    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
    const maxSpeed = MAX_SPEED * depthScale
    if (speed > maxSpeed) {
      p.vx = (p.vx / speed) * maxSpeed
      p.vy = (p.vy / speed) * maxSpeed
    }

    p.x += p.vx
    p.y += p.vy

    p.x = ((p.x % w) + w) % w
    p.y = ((p.y % h) + h) % h

    const radius = p.baseRadius * (0.25 + p.z * 0.75)
    const alpha = 0.15 + p.z * 0.55
    const color = colors[p.variant]

    const grad = ctxB.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius)
    grad.addColorStop(0, `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`)
    grad.addColorStop(0.45, `color-mix(in srgb, ${color} ${Math.round(alpha * 40)}%, transparent)`)
    grad.addColorStop(1, `color-mix(in srgb, ${color} 0%, transparent)`)

    ctxB.beginPath()
    ctxB.arc(p.x, p.y, radius, 0, Math.PI * 2)
    ctxB.fillStyle = grad
    ctxB.fill()
  }

  // Step 3: composite bufB onto the visible canvas
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(bufB, 0, 0)

  // Step 4: swap buffers - bufB becomes the new "previous frame"
  const tmpCanvas = bufA
  const tmpCtx = ctxA
  bufA = bufB
  ctxA = ctxB
  bufB = tmpCanvas
  ctxB = tmpCtx

  animFrame = requestAnimationFrame(() => tick(ctx, w, h))
}

function initBuffers(w: number, h: number) {
  bufA = new OffscreenCanvas(w, h)
  bufB = new OffscreenCanvas(w, h)
  ctxA = bufA.getContext('2d') as OffscreenCanvasRenderingContext2D
  ctxB = bufB.getContext('2d') as OffscreenCanvasRenderingContext2D
}

function resize() {
  const el = canvas.value
  if (!el)
    return
  el.width = window.innerWidth
  el.height = window.innerHeight
  initBuffers(el.width, el.height)
  createParticles(el.width, el.height)
}

onMounted(() => {
  const el = canvas.value
  if (!el)
    return
  const ctx = el.getContext('2d')
  if (!ctx)
    return

  resolveColors()
  resize()

  const themeObserver = new MutationObserver(resolveColors)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })

  window.addEventListener('resize', resize)
  window.addEventListener('mousemove', (e) => {
    const rect = el.getBoundingClientRect()
    mouse.x = e.clientX - rect.left
    mouse.y = e.clientY - rect.top
  })
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0)
      mouse.left = true
    if (e.button === 2)
      mouse.right = true
  })
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0)
      mouse.left = false
    if (e.button === 2)
      mouse.right = false
  })
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
  })

  tick(ctx, el.width, el.height)
})

onUnmounted(() => {
  cancelAnimationFrame(animFrame)
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <canvas ref="canvas" class="particle-field" />
</template>

<style lang="scss" scoped>
.particle-field {
  display: block;
  width: 100vw;
  height: 100dvh;
  background: var(--color-bg);
  cursor: crosshair;
}
</style>
