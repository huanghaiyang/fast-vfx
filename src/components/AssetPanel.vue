<template>
  <aside class="panel left">
    <div class="tabs">
      <button :class="{ on: S.tab === 'preset' }" @click="S.tab = 'preset'">预设</button>
      <button :class="{ on: S.tab === 'model' }" @click="S.tab = 'model'">模型</button>
      <button :class="{ on: S.tab === 'texture' }" @click="S.tab = 'texture'">贴图</button>
    </div>

    <div class="panel-body">
      <div v-if="S.tab === 'preset'" class="pad">
        <div class="phint">一键载入完整特效，可直接在此基础上改造。</div>
        <template v-for="g in groups" :key="g.tag">
          <div class="pgroup">
            <em>{{ g.tag }}</em>
            <i>{{ g.items.length }}</i>
            <span class="pline"></span>
          </div>
          <button class="preset" v-for="p in g.items" :key="p.id" @click="A.setPreset(p.id)">
            <span class="stripe" :style="{ background: p.accent }"></span>
            <span class="pi">
              <span class="pn">{{ p.name }}</span>
              <span class="pd">{{ p.desc }}</span>
            </span>
            <span class="arrow">›</span>
          </button>
        </template>
        <button class="blank" @click="A.newDoc()">＋ 新建空场景</button>
      </div>

      <div v-else-if="S.tab === 'model'" class="pad">
        <div class="phint">内置参数化模型，全部可导出为 Godot 网格。</div>
        <div class="grid">
          <button class="geo" v-for="g in GEO_LIST" :key="g.kind" @click="A.addModel(g.kind)" :title="g.hint">
            <span class="ico" v-html="GEO_ICONS[g.kind]"></span>
            <span class="gl">{{ g.label }}</span>
          </button>
        </div>
        <div class="tipbox">
          <b>建模流程</b>
          <div class="hint">添加模型 → 右侧调尺寸 / 细分 / 形变 / 材质 → 时间轴打关键帧 → 导出 Godot。</div>
        </div>
      </div>

      <div v-else class="pad">
        <div class="phint">程序化贴图实时生成；也可上传 PNG 作为粒子贴图。</div>
        <div class="grid tex-grid">
          <button class="tex" v-for="t in S.doc.textures" :key="t.id" @click="pickTexture(t.id)" :title="'应用「' + t.name + '」'">
            <img :src="thumb(t)" alt="" />
            <span class="tn">{{ t.name }}</span>
          </button>
        </div>
        <button class="blank" @click="fileInput?.click()">＋ 上传贴图 (PNG/JPG)</button>
        <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="onUpload" />
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { S, A, addTexture, selectTexture, toast, pushHistory } from '../core/store'
import { PRESETS } from '../core/presets'
import { GEO_LIST } from '../core/geometry'
import { GEO_ICONS } from './icons'
import { canvasToDataURL } from '../core/textures'
import type { Preset } from '../core/presets'
import type { TextureAsset } from '../core/types'

const groups = computed(() => {
  const out: Array<{ tag: string; items: Preset[] }> = []
  for (const p of PRESETS) {
    let g = out.find((x) => x.tag === p.tag)
    if (!g) {
      g = { tag: p.tag, items: [] }
      out.push(g)
    }
    g.items.push(p)
  }
  return out
})

const fileInput = ref<HTMLInputElement>()
const thumbCache = new Map<string, string>()

function thumb(t: TextureAsset): string {
  if (t.dataUrl) return t.dataUrl
  const key = t.id + '|' + t.gen + '|' + t.params.seed + '|' + t.params.softness
  let v = thumbCache.get(key)
  if (!v) {
    v = canvasToDataURL(t.gen, t.params, 96)
    thumbCache.set(key, v)
  }
  return v
}

function pickTexture(id: string) {
  if (!S.selectedId) {
    toast('先选中一个对象，再点击贴图应用', 'warn')
    return
  }
  selectTexture(id)
  toast('贴图已应用', 'ok')
}

function onUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > 4 * 1024 * 1024) {
    toast('图片过大（上限 4MB）', 'warn')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const asset: TextureAsset = {
      id: 'up_' + Math.random().toString(36).slice(2, 8),
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 12),
      gen: '',
      dataUrl: reader.result as string,
      params: { seed: 1, contrast: 1, softness: 0.5 }
    }
    addTexture(asset)
    if (S.selectedId) selectTexture(asset.id)
    toast('贴图已导入', 'ok')
  }
  reader.readAsDataURL(file)
  input.value = ''
}
</script>
