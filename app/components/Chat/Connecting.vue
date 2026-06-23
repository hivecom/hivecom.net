<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{
  offline?: boolean
}>()

const emit = defineEmits<{
  retry: []
  goBack: []
}>()

interface Vec3 {
  x: number
  y: number
  z: number
}

interface Proj {
  sx: number
  sy: number
  depth: number
}

interface Arc {
  a: Vec3
  b: Vec3
  t: number
  speed: number
  life: number
}

interface Ping {
  c: Vec3
  ang: number
}

const canvas = ref<HTMLCanvasElement | null>(null)

let rafId = 0
let ro: ResizeObserver | null = null

let dpr = 1
let size = 0
let cx = 0
let cy = 0
let radius = 0

let accentRgb = '99, 102, 241'
// Resolved separately for offline (red) mode.
let offlineRgb = '239, 68, 68'

// Base viewing tilt, so we look at the globe from slightly above.
const TILT = -0.42
const ROT_SPEED = 0.00016

const cosTilt = Math.cos(TILT)
const sinTilt = Math.sin(TILT)
let rotCosY = 1
let rotSinY = 0

const arcs: Arc[] = []
const pings: Ping[] = []
let lastSpawn = -Infinity
let spawnDelay = 0

const MAX_ARCS = 4
const ARC_SEGMENTS = 44
const PING_SEGMENTS = 60
const PING_SPEED = 0.022

function resolveRgb(name: string, fallback: string): string {
  const probe = document.createElement('span')
  probe.style.cssText = `position:fixed;pointer-events:none;visibility:hidden;color:var(${name})`
  document.body.appendChild(probe)
  const color = getComputedStyle(probe).color
  document.body.removeChild(probe)
  const m = color.match(/\d+/g)
  if (!m)
    return fallback
  return `${m[0]}, ${m[1]}, ${m[2]}`
}

function randomPoint(): Vec3 {
  const u = Math.random() * 2 - 1
  const theta = Math.random() * Math.PI * 2
  const r = Math.sqrt(Math.max(0, 1 - u * u))
  return { x: Math.cos(theta) * r, y: u, z: Math.sin(theta) * r }
}

// Spherical interpolation between two unit vectors.
function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z
  dot = Math.max(-1, Math.min(1, dot))
  const omega = Math.acos(dot)
  if (omega < 1e-4)
    return { x: a.x, y: a.y, z: a.z }
  const so = Math.sin(omega)
  const k0 = Math.sin((1 - t) * omega) / so
  const k1 = Math.sin(t * omega) / so
  return {
    x: a.x * k0 + b.x * k1,
    y: a.y * k0 + b.y * k1,
    z: a.z * k0 + b.z * k1,
  }
}

function spawnArc() {
  const a = randomPoint()
  let b = randomPoint()
  let dot = a.x * b.x + a.y * b.y + a.z * b.z
  let guard = 0
  // Bias toward endpoints that sit reasonably far apart.
  while (dot > 0.4 && guard < 8) {
    b = randomPoint()
    dot = a.x * b.x + a.y * b.y + a.z * b.z
    guard++
  }
  arcs.push({ a, b, t: 0, speed: 0.004 + Math.random() * 0.005, life: 1 })
  // Each new connection sends a ripple across the sphere from its origin.
  pings.push({ c: a, ang: 0 })
}

// Rotate around Y (spin) then tilt around X, project orthographically.
function project(v: Vec3): Proj {
  const x1 = v.x * rotCosY + v.z * rotSinY
  const z1 = -v.x * rotSinY + v.z * rotCosY
  const y1 = v.y
  const z2 = y1 * sinTilt + z1 * cosTilt
  const y2 = y1 * cosTilt - z1 * sinTilt
  return { sx: cx + x1 * radius, sy: cy - y2 * radius, depth: z2 }
}

function drawNodeMarker(ctx: CanvasRenderingContext2D, p: Proj, life: number) {
  if (p.depth < -0.1)
    return
  const t = (p.depth + 1) / 2
  ctx.beginPath()
  ctx.fillStyle = `rgba(${accentRgb}, ${0.6 * t * life})`
  ctx.arc(p.sx, p.sy, 1.6, 0, Math.PI * 2)
  ctx.fill()
}

function drawArc(ctx: CanvasRenderingContext2D, arc: Arc) {
  const lift = 0.45
  const pts: Proj[] = []
  for (let s = 0; s <= ARC_SEGMENTS; s++) {
    const u = s / ARC_SEGMENTS
    const sp = slerp(arc.a, arc.b, u)
    // Lift the arc off the surface so it bulges outward.
    const scale = 1 + lift * Math.sin(u * Math.PI)
    sp.x *= scale
    sp.y *= scale
    sp.z *= scale
    pts.push(project(sp))
  }

  // Only draw up to where the dot currently sits.
  const headSeg = arc.t < 1 ? Math.floor(arc.t * ARC_SEGMENTS) : ARC_SEGMENTS

  ctx.lineWidth = 1.4
  ctx.lineCap = 'butt'
  for (let s = 0; s < headSeg; s++) {
    const p0 = pts[s]!
    const p1 = pts[s + 1]!
    const depthAvg = (p0.depth + p1.depth) / 2
    const vis = Math.max(0, Math.min(1, depthAvg + 0.35))
    if (vis <= 0.01)
      continue
    ctx.beginPath()
    ctx.strokeStyle = `rgba(${accentRgb}, ${vis * 0.55 * arc.life})`
    ctx.moveTo(p0.sx, p0.sy)
    ctx.lineTo(p1.sx, p1.sy)
    ctx.stroke()
  }

  // Traveling data packet - stops at destination then fades with arc.life.
  {
    const t = Math.min(arc.t, 1)
    const idx = t * ARC_SEGMENTS
    const i0 = Math.floor(idx)
    const frac = idx - i0
    const p0 = pts[i0]!
    const p1 = pts[Math.min(ARC_SEGMENTS, i0 + 1)]!
    const px = p0.sx + (p1.sx - p0.sx) * frac
    const py = p0.sy + (p1.sy - p0.sy) * frac
    const depth = p0.depth + (p1.depth - p0.depth) * frac
    if (depth > -0.2) {
      const a = Math.max(0, Math.min(1, depth + 0.4))
      ctx.beginPath()
      ctx.fillStyle = `rgba(${accentRgb}, ${0.18 * a * arc.life})`
      ctx.arc(px, py, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.fillStyle = `rgba(${accentRgb}, ${0.95 * a * arc.life})`
      ctx.arc(px, py, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  drawNodeMarker(ctx, project(arc.a), arc.life)
}

// A ping is a geodesic circle (constant angular distance from its origin)
// expanding across the sphere surface, hidden where it wraps to the far side.
function drawPing(ctx: CanvasRenderingContext2D, ping: Ping) {
  const c = ping.c
  // Tangent basis perpendicular to the origin point.
  const ref: Vec3 = Math.abs(c.y) < 0.95 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
  let ux = ref.y * c.z - ref.z * c.y
  let uy = ref.z * c.x - ref.x * c.z
  let uz = ref.x * c.y - ref.y * c.x
  const ul = Math.hypot(ux, uy, uz) || 1
  ux /= ul
  uy /= ul
  uz /= ul
  const vx = c.y * uz - c.z * uy
  const vy = c.z * ux - c.x * uz
  const vz = c.x * uy - c.y * ux

  const cosA = Math.cos(ping.ang)
  const sinA = Math.sin(ping.ang)
  const intensity = Math.sin(ping.ang) * (1 - ping.ang / Math.PI)

  let prev: Proj | null = null
  for (let s = 0; s <= PING_SEGMENTS; s++) {
    const phi = (s / PING_SEGMENTS) * Math.PI * 2
    const cp = Math.cos(phi)
    const sp = Math.sin(phi)
    const p: Vec3 = {
      x: c.x * cosA + (ux * cp + vx * sp) * sinA,
      y: c.y * cosA + (uy * cp + vy * sp) * sinA,
      z: c.z * cosA + (uz * cp + vz * sp) * sinA,
    }
    const pr = project(p)
    if (prev) {
      const depthAvg = (prev.depth + pr.depth) / 2
      const vis = Math.max(0, Math.min(1, depthAvg + 0.25))
      if (vis > 0.01) {
        ctx.beginPath()
        ctx.strokeStyle = `rgba(${accentRgb}, ${vis * intensity * 0.7})`
        ctx.lineWidth = 1
        ctx.moveTo(prev.sx, prev.sy)
        ctx.lineTo(pr.sx, pr.sy)
        ctx.stroke()
      }
    }
    prev = pr
  }
}

function resize() {
  const el = canvas.value
  if (!el)
    return
  const box = el.parentElement
  if (!box)
    return
  dpr = Math.min(2, window.devicePixelRatio || 1)
  size = box.clientWidth
  if (!size)
    return
  el.width = Math.round(size * dpr)
  el.height = Math.round(size * dpr)
  cx = size / 2
  cy = size / 2
  radius = size * 0.34
}

function loop(now: number) {
  const el = canvas.value
  if (!el)
    return
  const ctx = el.getContext('2d')
  if (!ctx)
    return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size, size)

  const yaw = now * ROT_SPEED
  rotCosY = Math.cos(yaw)
  rotSinY = Math.sin(yaw)

  // Soft atmospheric glow behind the globe.
  const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.45)
  glow.addColorStop(0, `rgba(${accentRgb}, 0.10)`)
  glow.addColorStop(1, `rgba(${accentRgb}, 0)`)
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, cy, radius * 1.45, 0, Math.PI * 2)
  ctx.fill()

  // Surface pings rippling out from each arc's origin.
  for (let k = pings.length - 1; k >= 0; k--) {
    const ping = pings[k]!
    ping.ang += PING_SPEED
    if (ping.ang >= Math.PI) {
      pings.splice(k, 1)
      continue
    }
    drawPing(ctx, ping)
  }

  // Spawn, advance, retire, and draw the connection arcs.
  // Stop spawning new arcs in offline mode so the globe empties out.
  if (now - lastSpawn > spawnDelay && arcs.length < MAX_ARCS && !props.offline) {
    spawnArc()
    lastSpawn = now
    spawnDelay = 600 + Math.random() * 1100
  }

  for (let k = arcs.length - 1; k >= 0; k--) {
    const arc = arcs[k]!
    arc.t += arc.speed
    if (arc.t >= 1)
      arc.life -= 0.04
    if (arc.life <= 0) {
      arcs.splice(k, 1)
      continue
    }
    drawArc(ctx, arc)
  }

  rafId = requestAnimationFrame(loop)
}

onMounted(() => {
  if (props.offline) {
    offlineRgb = resolveRgb('--color-text-red', '239, 68, 68')
    accentRgb = offlineRgb
  }
  else {
    accentRgb = resolveRgb('--color-accent', '99, 102, 241')
  }
  resize()
  ro = new ResizeObserver(resize)
  ro.observe(canvas.value!.parentElement!)
  rafId = requestAnimationFrame(loop)
})

onUnmounted(() => {
  ro?.disconnect()
  cancelAnimationFrame(rafId)
})
</script>

<template>
  <div class="chat-connecting" :class="{ 'chat-connecting--offline': props.offline }">
    <div class="chat-connecting__viz">
      <canvas ref="canvas" class="chat-connecting__canvas" />
      <div class="chat-connecting__label">
        <span class="chat-connecting__word">{{ props.offline ? 'Offline' : 'Connecting' }}</span>
        <span v-if="props.offline" class="chat-connecting__subtext">Server may be offline or no internet connection</span>
        <span v-else class="chat-connecting__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
    <Flex v-if="props.offline" x-center gap="s" class="chat-connecting__actions">
      <Button variant="gray" @click="emit('goBack')">
        <template #start>
          <Icon name="ph:arrow-left" />
        </template>
        Go back
      </Button>
      <Button variant="accent" @click="emit('retry')">
        <template #start>
          <Icon name="ph:arrows-clockwise" />
        </template>
        Retry
      </Button>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
.chat-connecting {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-m);
  overflow: hidden;

  &__viz {
    position: relative;
    width: clamp(140px, 60%, 280px);
    aspect-ratio: 1 / 1;
  }

  &__canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  &__label {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    pointer-events: none;
    user-select: none;
  }

  &__word {
    font-size: var(--font-size-s);
    letter-spacing: 0.04em;
    color: var(--color-text);
    text-shadow:
      0 0 8px var(--color-bg),
      0 0 6px var(--color-bg);
  }

  &__subtext {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    text-align: center;
    max-width: 200px;
    text-shadow:
      0 0 8px var(--color-bg),
      0 0 6px var(--color-bg);
  }

  &--offline {
    .chat-connecting__word {
      color: var(--color-text-red);
    }
  }

  &__dots {
    display: inline-flex;
    gap: 3px;

    i {
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: var(--color-accent);
      animation: chat-connecting-dot 1.4s ease-in-out infinite;

      &:nth-child(2) {
        animation-delay: 0.18s;
      }

      &:nth-child(3) {
        animation-delay: 0.36s;
      }
    }
  }
}

@keyframes chat-connecting-dot {
  0%,
  60%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-2px);
  }
}
</style>
