<template>
  <section class="viewport">
    <canvas ref="canvas" class="vp-canvas"></canvas>

    <div class="vp-overlay">
      <div class="vp-top">
        <div class="seg">
          <button :class="{ on: S.mode === 'translate' }" @click="S.mode = 'translate'" title="移动 (W)">移动</button>
          <button :class="{ on: S.mode === 'rotate' }" @click="S.mode = 'rotate'" title="旋转 (E)">旋转</button>
          <button :class="{ on: S.mode === 'scale' }" @click="S.mode = 'scale'" title="缩放 (R)">缩放</button>
        </div>
        <div class="chips">
          <button class="chip" :class="{ on: S.doc.bloom }" @click="toggle('bloom')">✦ 泛光</button>
          <button class="chip" :class="{ on: S.doc.grid }" @click="toggle('grid')">▦ 网格</button>
          <button class="chip" :class="{ on: S.showPaths }" title="显示位移轨道的轨迹线" @click="togglePaths">◈ 路径</button>
          <button class="chip" @click="A.captureCamera()">◎ 机位</button>
        </div>
      </div>

      <div class="vp-left">
        <div class="stat"><b>{{ S.fps || '—' }}</b> FPS</div>
        <div class="stat"><b>{{ S.doc.objects.length }}</b> 对象</div>
        <div class="stat"><b>{{ S.time.toFixed(2) }}</b> / {{ S.doc.duration.toFixed(2) }}s</div>
      </div>

      <div class="vp-hint">左键环绕 · 右键平移 · 滚轮缩放 · 单击选中 · W/E/R 切换变换</div>

      <div class="vp-selected" v-if="selLabel">
        <span class="dot"></span>{{ selLabel }}
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { S, A, pushHistory, registerEngine } from '../core/store'
import { FXEngine } from '../core/engine'

const canvas = ref<HTMLCanvasElement>()
let engine: FXEngine | null = null

const selLabel = computed(() => {
  const o = S.doc.objects.find((x) => x.id === S.selectedId)
  if (!o) return ''
  return `${o.name} · ${o.kind === 'particles' ? '粒子' : '模型'}`
})

function toggle(key: 'bloom' | 'grid') {
  pushHistory()
  S.doc[key] = !S.doc[key]
}

function togglePaths() {
  S.showPaths = !S.showPaths
  S.version++
}

onMounted(() => {
  engine = new FXEngine(canvas.value!, S as any, {
    onSelect: (id) => {
      S.selectedId = id
    },
    onTime: (t) => {
      S.time = t
    },
    onFps: (f) => {
      S.fps = f
    },
    onTransform: (id) => {
      A.autoKeyTransform(id)
    }
  })
  engine.onBeforeEdit = pushHistory
  registerEngine(engine)
})

watch(
  () => S.doc,
  () => engine?.sync(),
  { deep: true }
)
watch(() => S.version, () => engine?.sync())
watch(
  () => S.selectedId,
  (id) => engine?.setSelection(id)
)
watch(
  () => S.mode,
  (m) => engine?.setMode(m)
)
watch(
  () => S.showPaths,
  () => engine?.sync()
)

onBeforeUnmount(() => {
  registerEngine(null)
  engine?.dispose()
  engine = null
})
</script>

<style scoped>
.viewport {
  position: relative;
  min-width: 0;
  min-height: 0;
  background: radial-gradient(circle at 50% 42%, #151a26 0%, #08090f 62%, #05060a 100%);
  overflow: hidden;
}
.vp-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
}
.vp-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.vp-top {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}
.vp-top > * {
  pointer-events: auto;
}
.chips {
  display: flex;
  gap: 6px;
}
.chip {
  background: rgba(12, 14, 22, 0.78);
  border: 1px solid var(--line);
  color: var(--dim);
  padding: 5px 9px;
  font-size: 11px;
  backdrop-filter: blur(6px);
}
.chip.on {
  color: var(--accent);
  border-color: rgba(255, 138, 61, 0.45);
  background: rgba(255, 138, 61, 0.1);
}
.vp-left {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 10.5px;
  color: var(--dim-2);
  background: rgba(8, 10, 16, 0.6);
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  padding: 6px 9px;
  backdrop-filter: blur(6px);
}
.stat b {
  color: #c9d1e4;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.vp-hint {
  position: absolute;
  right: 12px;
  bottom: 14px;
  font-size: 10.5px;
  color: #5c6479;
  pointer-events: none;
}
.vp-selected {
  position: absolute;
  left: 50%;
  top: 10px;
  transform: translateX(-50%);
  background: rgba(12, 14, 22, 0.8);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 11px;
  color: #cdd5e6;
  display: flex;
  align-items: center;
  gap: 6px;
  backdrop-filter: blur(6px);
}
.vp-selected .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}
</style>
