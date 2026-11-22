<template>
  <div class="cw" ref="wrap">
    <canvas ref="cv" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointerleave="onLeave" @dblclick="onDbl" @contextmenu.prevent="onCtx" />
    <div class="cbar">
      <span class="hint">双击空白加点 · 双击点删除</span>
      <span class="hint">纵轴 {{ maxV.toFixed(1) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Curve } from '../../core/types'
import { evalCurve } from '../../core/curve'

const props = defineProps<{ modelValue: Curve }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Curve): void; (e: 'begin'): void }>()

const cv = ref<HTMLCanvasElement>()
const wrap = ref<HTMLDivElement>()
const H = 92
let W = 240
let drag = -1
let hover = -1
let ro: ResizeObserver | null = null

const maxV = computed(() => {
  const pts = props.modelValue?.points || []
  return Math.max(1.05, ...pts.map((p) => p.v), 0.1) * 1.12
})

function resize() {
  const el = cv.value
  if (!el) return
  const rect = wrap.value!.getBoundingClientRect()
  W = Math.max(120, rect.width)
  const dpr = Math.min(devicePixelRatio, 2)
  el.width = W * dpr
  el.height = H * dpr
  el.style.width = W + 'px'
  el.style.height = H + 'px'
  draw()
}

function draw() {
  const el = cv.value
  if (!el) return
  const ctx = el.getContext('2d')!
  const dpr = Math.min(devicePixelRatio, 2)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0b0d14'
  ctx.fillRect(0, 0, W, H)
  // 网格
  ctx.strokeStyle = '#1b2030'
  ctx.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    const y = (H / 4) * i
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  for (let i = 1; i < 6; i++) {
    const x = (W / 6) * i
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  const mv = maxV.value
  // 曲线
  ctx.strokeStyle = '#ff8a3d'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  for (let i = 0; i <= 60; i++) {
    const t = i / 60
    const v = evalCurve(props.modelValue, t)
    const x = t * W
    const y = H - (v / mv) * H
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,138,61,0.1)'
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.fill()
  // 控制点
  const pts = props.modelValue?.points || []
  pts.forEach((p, i) => {
    const x = p.t * W
    const y = H - (p.v / mv) * H
    ctx.beginPath()
    ctx.arc(x, y, i === hover || i === drag ? 5 : 4, 0, Math.PI * 2)
    ctx.fillStyle = i === drag || i === hover ? '#fff' : '#ffb26b'
    ctx.fill()
    ctx.strokeStyle = '#3a2a16'
    ctx.lineWidth = 1
    ctx.stroke()
  })
}

watch(() => props.modelValue, draw, { deep: true })
watch(maxV, draw)

function local(e: PointerEvent | MouseEvent) {
  const r = cv.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function toTV(x: number, y: number) {
  return { t: Math.min(1, Math.max(0, x / W)), v: Math.min(maxV.value, Math.max(0, (1 - y / H) * maxV.value)) }
}

function hit(x: number, y: number) {
  const mv = maxV.value
  const pts = props.modelValue?.points || []
  for (let i = 0; i < pts.length; i++) {
    const px = pts[i].t * W
    const py = H - (pts[i].v / mv) * H
    if (Math.hypot(px - x, py - y) < 8) return i
  }
  return -1
}

function commit(points: Array<{ t: number; v: number }>) {
  points.sort((a, b) => a.t - b.t)
  emit('update:modelValue', { points })
  draw()
}

function onDown(e: PointerEvent) {
  const { x, y } = local(e)
  let i = hit(x, y)
  if (i < 0) {
    if ((props.modelValue?.points || []).length >= 12) return
    const tv = toTV(x, y)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    emit('begin')
    commit([...props.modelValue.points, { t: tv.t, v: tv.v }])
    drag = (props.modelValue?.points || []).findIndex((p) => Math.abs(p.t - tv.t) < 1e-4)
    return
  }
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  emit('begin')
  drag = i
  draw()
}

function onMove(e: PointerEvent) {
  const { x, y } = local(e)
  if (drag < 0) {
    const h = hit(x, y)
    if (h !== hover) {
      hover = h
      draw()
    }
    return
  }
  const tv = toTV(x, y)
  const pts = [...props.modelValue.points]
  const cur = pts[drag]
  if (!cur) return
  const fixedEdge = drag === 0 || drag === pts.length - 1
  cur.t = fixedEdge && drag === 0 ? 0 : fixedEdge ? 1 : tv.t
  cur.v = tv.v
  commit(pts)
}

function onUp() {
  drag = -1
  draw()
}

function onLeave() {
  hover = -1
  draw()
}

function onDbl(e: MouseEvent) {
  const { x, y } = local(e)
  const i = hit(x, y)
  if (i < 0) return
  if ((props.modelValue?.points || []).length <= 2) return
  emit('begin')
  const pts = props.modelValue.points.filter((_, idx) => idx !== i)
  commit(pts)
}

function onCtx(e: MouseEvent) {
  const { x, y } = local(e)
  const i = hit(x, y)
  if (i < 0 || (props.modelValue?.points || []).length <= 2) return
  emit('begin')
  commit(props.modelValue.points.filter((_, idx) => idx !== i))
}

onMounted(() => {
  ro = new ResizeObserver(resize)
  ro.observe(wrap.value!)
  resize()
})
onBeforeUnmount(() => ro?.disconnect())
</script>

<style scoped>
.cw {
  width: 100%;
}
canvas {
  display: block;
  border: 1px solid var(--line);
  border-radius: 6px;
  cursor: crosshair;
  touch-action: none;
}
.cbar {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
}
</style>
