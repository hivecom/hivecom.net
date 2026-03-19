<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useGlobePerf } from '@/composables/useGlobePerf'
import fragSrc from './LandingHeroBackgroundShader.frag.glsl?raw'
import vertSrc from './LandingHeroBackgroundShader.vert.glsl?raw'

const canvasEl = ref<HTMLCanvasElement | null>(null)
let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let buffer: WebGLBuffer | null = null
let timeUniform: WebGLUniformLocation | null = null
let resolutionUniform: WebGLUniformLocation | null = null
let baseColorUniform: WebGLUniformLocation | null = null
let altColorUniform: WebGLUniformLocation | null = null
let rafId: number | null = null
let start = 0
let startOffset = 0
let themeObserver: MutationObserver | null = null
let themeMedia: MediaQueryList | null = null
const { params: perfParams } = useGlobePerf()

// Current accent color as a [r, g, b] vec normalized to 0..1
let baseColor: [number, number, number] = [0.655, 0.988, 0.184] // #a7fc2f fallback
let altColor: [number, number, number] = [0.5, 0.92, 0.32]

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function hexToVec3(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255
  return [r, g, b]
}

/**
 * Linearly blend two vec3 colors by t (0..1).
 * Used to derive a slightly shifted alt color from the accent.
 */
function blendVec3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

function readAccentColors() {
  const accent = cssVar('--color-accent')
  const accentRaised = cssVar('--color-bg-accent-raised')

  if (accent.startsWith('#')) {
    baseColor = hexToVec3(accent)
    // alt color: blend accent toward the raised variant for subtle variation
    const raised = accentRaised.startsWith('#') ? hexToVec3(accentRaised) : baseColor
    altColor = blendVec3(baseColor, raised, 0.35)
  }
}

function createShader(context: WebGLRenderingContext, type: number, source: string) {
  const shader = context.createShader(type)
  if (!shader)
    return null
  context.shaderSource(shader, source)
  context.compileShader(shader)
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    console.error('Shader compile error:', context.getShaderInfoLog(shader))
    context.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(context: WebGLRenderingContext, vert: string, frag: string) {
  const vs = createShader(context, context.VERTEX_SHADER, vert)
  const fs = createShader(context, context.FRAGMENT_SHADER, frag)
  if (!vs || !fs)
    return null
  const prog = context.createProgram()
  if (!prog)
    return null
  context.attachShader(prog, vs)
  context.attachShader(prog, fs)
  context.linkProgram(prog)
  if (!context.getProgramParameter(prog, context.LINK_STATUS)) {
    console.error('Program link error:', context.getProgramInfoLog(prog))
    context.deleteProgram(prog)
    return null
  }
  context.deleteShader(vs)
  context.deleteShader(fs)
  return prog
}

function resize() {
  if (!canvasEl.value || !gl)
    return
  const { width, height } = canvasEl.value.getBoundingClientRect()
  const dpr = (window.devicePixelRatio || 1) * perfParams.value.bgResScale
  const w = Math.max(1, Math.floor(width * dpr))
  const h = Math.max(1, Math.floor(height * dpr))
  if (canvasEl.value.width !== w || canvasEl.value.height !== h) {
    canvasEl.value.width = w
    canvasEl.value.height = h
    gl.viewport(0, 0, w, h)
  }
}

function render(now: number) {
  if (!gl || !program || !canvasEl.value)
    return
  if (!start)
    start = now - startOffset
  const t = (now - start) / 1000
  resize()

  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  const positionLoc = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(positionLoc)
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

  gl.uniform1f(timeUniform, t)
  gl.uniform2f(resolutionUniform, canvasEl.value.width, canvasEl.value.height)
  gl.uniform3f(baseColorUniform, ...baseColor)
  gl.uniform3f(altColorUniform, ...altColor)

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  rafId = requestAnimationFrame(render)
}

function onThemeChange() {
  readAccentColors()
}

function setupThemeWatcher() {
  themeMedia = window.matchMedia?.('(prefers-color-scheme: light)') ?? null
  themeMedia?.addEventListener('change', onThemeChange)

  themeObserver = new MutationObserver(onThemeChange)
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  })
}

onMounted(() => {
  if (!import.meta.client)
    return
  const canvas = canvasEl.value
  if (!canvas)
    return

  gl = canvas.getContext('webgl', { premultipliedAlpha: false })
  if (!gl)
    return

  startOffset = Math.random() * 100000

  program = createProgram(gl, vertSrc, fragSrc)
  if (!program)
    return

  timeUniform = gl.getUniformLocation(program, 'u_time')
  resolutionUniform = gl.getUniformLocation(program, 'u_resolution')
  baseColorUniform = gl.getUniformLocation(program, 'u_base_color')
  altColorUniform = gl.getUniformLocation(program, 'u_alt_color')
  buffer = gl.createBuffer()
  if (!buffer || !timeUniform || !resolutionUniform || !baseColorUniform || !altColorUniform)
    return

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1,
    -1,
    1,
    -1,
    -1,
    1,
    1,
    1,
  ]), gl.STATIC_DRAW)

  readAccentColors()
  setupThemeWatcher()
  resize()
  rafId = requestAnimationFrame(render)
  window.addEventListener('resize', resize)
})

onBeforeUnmount(() => {
  if (rafId)
    cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
  themeMedia?.removeEventListener('change', onThemeChange)
  themeObserver?.disconnect()
  themeObserver = null
  themeMedia = null
  if (gl && buffer)
    gl.deleteBuffer(buffer)
  if (gl && program)
    gl.deleteProgram(program)
  gl = null
  program = null
  buffer = null
  timeUniform = null
  resolutionUniform = null
  baseColorUniform = null
  altColorUniform = null
})
</script>

<template>
  <canvas ref="canvasEl" class="hero-shader" aria-hidden="true" />
</template>

<style scoped>
.hero-shader {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
