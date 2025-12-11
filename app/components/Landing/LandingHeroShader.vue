<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import fragSrc from './LandingHeroShader.frag.glsl?raw'
import vertSrc from './LandingHeroShader.vert.glsl?raw'

const canvasEl = ref<HTMLCanvasElement | null>(null)
let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let buffer: WebGLBuffer | null = null
let timeUniform: WebGLUniformLocation | null = null
let resolutionUniform: WebGLUniformLocation | null = null
let rafId: number | null = null
let start = 0
let startOffset = 0
const RES_SCALE = 0.4

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

function createProgram(context: WebGLRenderingContext, vertSrc: string, fragSrc: string) {
  const vert = createShader(context, context.VERTEX_SHADER, vertSrc)
  const frag = createShader(context, context.FRAGMENT_SHADER, fragSrc)
  if (!vert || !frag)
    return null
  const prog = context.createProgram()
  if (!prog)
    return null
  context.attachShader(prog, vert)
  context.attachShader(prog, frag)
  context.linkProgram(prog)
  if (!context.getProgramParameter(prog, context.LINK_STATUS)) {
    console.error('Program link error:', context.getProgramInfoLog(prog))
    context.deleteProgram(prog)
    return null
  }
  context.deleteShader(vert)
  context.deleteShader(frag)
  return prog
}

function resize() {
  if (!canvasEl.value || !gl)
    return
  const { width, height } = canvasEl.value.getBoundingClientRect()
  const dpr = (window.devicePixelRatio || 1) * RES_SCALE
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

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  rafId = requestAnimationFrame(render)
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

  startOffset = Math.random() * 100000 // randomize starting phase

  program = createProgram(gl, vertSrc, fragSrc)
  if (!program)
    return

  timeUniform = gl.getUniformLocation(program, 'u_time')
  resolutionUniform = gl.getUniformLocation(program, 'u_resolution')
  buffer = gl.createBuffer()
  if (!buffer || !timeUniform || !resolutionUniform)
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

  resize()
  rafId = requestAnimationFrame(render)
  window.addEventListener('resize', resize)
})

onBeforeUnmount(() => {
  if (rafId)
    cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
  if (gl && buffer)
    gl.deleteBuffer(buffer)
  if (gl && program)
    gl.deleteProgram(program)
  gl = null
  program = null
  buffer = null
  timeUniform = null
  resolutionUniform = null
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
