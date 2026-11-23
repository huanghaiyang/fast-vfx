<template>
  <div class="tp">
    <div class="tp-grid">
      <button
        v-for="t in items"
        :key="t.id"
        class="cell"
        :class="{ on: t.id === modelValue }"
        :title="`${t.name} · ${t.gen}`"
        @click="pick(t.id)"
      >
        <span class="thumb">
          <img :src="t.url" alt="" loading="lazy" />
        </span>
        <span class="nm">{{ t.name }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TextureAsset } from '../../core/types'
import { canvasToDataURL } from '../../core/textures'

const props = defineProps<{ textures: TextureAsset[]; modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'pick'): void }>()

const items = computed(() =>
  props.textures.map((t) => ({
    id: t.id,
    name: t.name,
    gen: t.gen,
    url: t.dataUrl || safeThumb(t)
  }))
)

/** 生成失败（比如参数异常）时退回占位，避免整块面板崩掉 */
function safeThumb(t: TextureAsset) {
  try {
    return canvasToDataURL(t.gen, t.params, 96)
  } catch {
    return ''
  }
}

function pick(id: string) {
  emit('pick')
  emit('update:modelValue', id)
}
</script>

<style scoped>
.tp {
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  background: #080a11;
  padding: 6px;
  max-height: 238px;
  overflow-y: auto;
}
.tp-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 5px;
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px 2px 3px;
  border-radius: 5px;
  border: 1px solid transparent;
  background: #0c0e16;
  cursor: pointer;
  min-width: 0;
}
.cell:hover {
  border-color: rgba(255, 138, 61, 0.35);
}
.cell.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(255, 138, 61, 0.35) inset, 0 0 10px rgba(255, 138, 61, 0.18);
  background: #14100c;
}
.thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 4px;
  overflow: hidden;
  background: #05060a;
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.94;
}
.cell.on .thumb img {
  opacity: 1;
}
.nm {
  font-size: 9px;
  color: var(--dim);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell.on .nm {
  color: var(--accent);
}
</style>
