<template>
  <div class="ge">
    <div class="bar" ref="bar" @pointerdown="onBarDown">
      <div class="fill" :style="{ background: cssGradient }"></div>
      <div
        v-for="(s, i) in modelValue.stops"
        :key="i"
        class="stop"
        :class="{ on: i === sel }"
        :style="{ left: s.t * 100 + '%', background: s.color }"
        @pointerdown.stop="startDrag(i, $event)"
        @dblclick.stop="remove(i)"
        @contextmenu.prevent.stop="remove(i)"
      ></div>
    </div>
    <div class="edit">
      <input type="color" :value="selected.color" @input="setColor($event)" @focus="$emit('begin')" />
      <NumberField :model-value="selected.t" :min="0" :max="1" :step="0.01" @begin="$emit('begin')" @update:model-value="setT" />
      <button class="icon danger" title="删除色标" @click="remove(sel)" :disabled="modelValue.stops.length <= 2">✕</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import NumberField from './NumberField.vue'
import type { Gradient } from '../../core/types'
import { gradientColorAt, gradientToCSS, rgbToHex } from '../../core/curve'

const props = defineProps<{ modelValue: Gradient }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Gradient): void; (e: 'begin'): void }>()

const sel = ref(0)
const bar = ref<HTMLDivElement>()
const cssGradient = computed(() => gradientToCSS(props.modelValue))
const selected = computed(() => props.modelValue.stops[sel.value] || props.modelValue.stops[0] || { t: 0, color: '#ffffff' })

function stopIndexAt(clientX: number) {
  const r = bar.value!.getBoundingClientRect()
  const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
  let best = 0
  let dist = 9
  props.modelValue.stops.forEach((s, i) => {
    const d = Math.abs(s.t - t)
    if (d < dist) {
      dist = d
      best = i
    }
  })
  return { t, best, hit: dist < 9 }
}

function onBarDown(e: PointerEvent) {
  const { t, best, hit } = stopIndexAt(e.clientX)
  if (hit) {
    sel.value = best
    startDrag(best, e)
    return
  }
  if (props.modelValue.stops.length >= 10) return
  emit('begin')
  const [r, g, b] = gradientColorAt(props.modelValue, t)
  props.modelValue.stops.push({ t, color: rgbToHex(r * 255, g * 255, b * 255) })
  sel.value = props.modelValue.stops.length - 1
  emit('update:modelValue', { stops: props.modelValue.stops })
}

function startDrag(i: number, e: PointerEvent) {
  sel.value = i
  emit('begin')
  const el = bar.value!
  const move = (ev: PointerEvent) => {
    const r = el.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width))
    props.modelValue.stops[i].t = Number(t.toFixed(3))
    emit('update:modelValue', { stops: [...props.modelValue.stops] })
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function setColor(e: Event) {
  const c = (e.target as HTMLInputElement).value
  props.modelValue.stops[sel.value].color = c
  emit('update:modelValue', { stops: [...props.modelValue.stops] })
}

function setT(v: number) {
  props.modelValue.stops[sel.value].t = v
  emit('update:modelValue', { stops: [...props.modelValue.stops] })
}

function remove(i: number) {
  if (props.modelValue.stops.length <= 2) return
  emit('begin')
  props.modelValue.stops.splice(i, 1)
  sel.value = Math.min(sel.value, props.modelValue.stops.length - 1)
  emit('update:modelValue', { stops: [...props.modelValue.stops] })
}
</script>

<style scoped>
.ge {
  width: 100%;
}
.bar {
  position: relative;
  height: 18px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: repeating-conic-gradient(#1a1d28 0% 25%, #222633 0% 50%) 50% / 10px 10px;
  cursor: copy;
  touch-action: none;
  margin-bottom: 16px;
}
.fill {
  position: absolute;
  inset: 0;
  border-radius: 4px;
  opacity: 0.95;
}
.stop {
  position: absolute;
  top: 100%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  transform: translate(-50%, -2px);
  border: 1px solid #0b0d14;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18);
  cursor: ew-resize;
}
.stop.on {
  box-shadow: 0 0 0 2px var(--accent);
}
.edit {
  display: grid;
  grid-template-columns: 44px 1fr 28px;
  gap: 6px;
  align-items: center;
}
</style>
