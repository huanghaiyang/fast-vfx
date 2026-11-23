<template>
  <div class="tp">
    <div class="tp-cats" @wheel="onCatWheel">
      <button
        v-for="c in cats"
        :key="c.id"
        class="cat"
        :class="{ on: c.id === active }"
        @click="active = c.id"
      >
        {{ c.name }}<em>{{ c.items.length }}</em>
      </button>
    </div>
    <div class="tp-grid">
      <button
        v-for="t in shown"
        :key="t.id"
        class="cell"
        :class="{ on: t.id === modelValue }"
        :title="t.name"
        @click="pick(t)"
      >
        <span class="thumb">
          <img :src="thumb(t)" alt="" loading="lazy" />
        </span>
        <span class="nm">{{ t.tag }}</span>
      </button>
    </div>
    <div class="tp-foot">
      {{ baseCount }} 类 × {{ VARIANT_COUNT + 1 }} 张 + 上传 {{ uploads.length }} 张 = {{ totalAll }} 张；当前分类 {{ shown.length }} 张
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TextureAsset } from '../../core/types'
import { canvasToDataURL, VARIANT_COUNT } from '../../core/textures'
import { texVariant } from '../../core/doc'
import { addTexture } from '../../core/store'

const props = defineProps<{ textures: TextureAsset[]; modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'pick'): void }>()

type Item = TextureAsset & { tag: string }

/** 基础贴图（程序化，未上传、非变形） */
const bases = computed(() => props.textures.filter((t) => !t.dataUrl && !(t.params?.variant ?? 0)))
/** 用户上传的贴图 */
const uploads = computed(() => props.textures.filter((t) => !!t.dataUrl))

const baseCount = computed(() => bases.value.length)
const totalAll = computed(() => bases.value.length * (VARIANT_COUNT + 1) + uploads.value.length)

const cats = computed(() => {
  const out: Array<{ id: string; name: string; items: Item[] }> = bases.value.map((b) => ({
    id: b.id,
    name: b.name,
    items: [
      { ...b, tag: '原始' },
      ...Array.from({ length: VARIANT_COUNT }, (_, k) => {
        const v = texVariant(b, k + 1)
        return { ...v, tag: `变形${k + 1}` } as Item
      })
    ]
  }))
  if (uploads.value.length) {
    out.push({
      id: '#upload',
      name: '上传',
      items: uploads.value.map((u) => ({ ...u, tag: '自传' }) as Item)
    })
  }
  return out
})

const active = ref('')
/** 当前选中贴图属于哪一类（变形按 id 反查基础类） */
function catOf(id: string) {
  const base = id.replace(/_v\d+$/, '')
  return bases.value.some((b) => b.id === base) ? base : uploads.value.some((u) => u.id === id) ? '#upload' : bases.value[0]?.id || ''
}
watch(
  () => props.modelValue,
  (id) => {
    if (!active.value) active.value = catOf(id)
  },
  { immediate: true }
)
watch(cats, (cs) => {
  if (!cs.some((c) => c.id === active.value)) active.value = cs[0]?.id || ''
})

const shown = computed(() => {
  const c = cats.value.find((x) => x.id === active.value)
  if (c) return c.items
  return cats.value.flatMap((x) => x.items)
})

function thumb(t: Item) {
  if (t.dataUrl) return t.dataUrl
  try {
    return canvasToDataURL(t.gen, t.params, 72)
  } catch {
    return ''
  }
}

/** 类别条只能横向滚，把竖向滚轮换算成横向位移，省得去抓 4px 滚动条 */
function onCatWheel(e: WheelEvent) {
  const el = e.currentTarget as HTMLElement
  if (!el || el.scrollWidth <= el.clientWidth) return
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
  el.scrollLeft += e.deltaY
  e.preventDefault()
}

function pick(t: Item) {
  emit('pick')
  if (!props.textures.some((x) => x.id === t.id)) {
    addTexture({ id: t.id, name: t.name, gen: t.gen, params: t.params, dataUrl: t.dataUrl })
  }
  emit('update:modelValue', t.id)
}
</script>

<style scoped>
.tp {
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  background: #080a11;
  padding: 6px;
}
.tp-cats {
  display: flex;
  gap: 3px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 1px 1px 6px;
  margin-bottom: 5px;
  border-bottom: 1px solid var(--line-soft);
  overscroll-behavior-x: contain;
}
/* 横向类别条：6px 圆角细滚动条，无箭头按钮、轨道压暗、滑块半透，悬停变橙 */
.tp-cats::-webkit-scrollbar {
  height: 6px;
}
.tp-cats::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}
.tp-cats::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 3px;
  margin: 0 2px;
}
.tp-cats::-webkit-scrollbar-thumb {
  background: rgba(125, 140, 168, 0.32);
  border-radius: 3px;
}
.tp-cats:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 138, 61, 0.5);
}
.cat {
  flex: 0 0 auto;
  font-size: 9.5px;
  padding: 2px 5px;
  border-radius: 4px;
  background: #0c0e16;
  color: var(--dim);
  border: 1px solid transparent;
  cursor: pointer;
  white-space: nowrap;
}
.cat em {
  font-style: normal;
  font-size: 8.5px;
  color: var(--dim-2);
  margin-left: 2px;
}
.cat:hover {
  color: #dbe3f2;
}
.cat.on {
  color: var(--accent);
  border-color: rgba(255, 138, 61, 0.45);
  background: rgba(255, 138, 61, 0.1);
}
.tp-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 5px;
  max-height: 236px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-gutter: stable;
  overscroll-behavior-y: contain;
}
/* 纵向贴图网格：6px 圆角细滚动条，无箭头按钮、轨道压暗、滑块半透，悬停变橙 */
.tp-grid::-webkit-scrollbar {
  width: 6px;
}
.tp-grid::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}
.tp-grid::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 3px;
}
.tp-grid::-webkit-scrollbar-thumb {
  background: rgba(125, 140, 168, 0.32);
  border-radius: 3px;
}
.tp-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 138, 61, 0.5);
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 3px 2px 2px;
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
  font-size: 8.5px;
  color: var(--dim);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell.on .nm {
  color: var(--accent);
}
.tp-foot {
  font-size: 9px;
  color: var(--dim-2);
  padding-top: 5px;
  margin-top: 4px;
  border-top: 1px solid var(--line-soft);
}
</style>
