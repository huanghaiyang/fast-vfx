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
          <button class="tex" v-for="t in S.doc.textures.filter((x) => !x.params?.variant)" :key="t.id" @click="pickTexture(t.id)" :title="'应用「' + t.name + '」'">
            <img :src="thumb(t)" alt="" />
            <span class="tn">{{ t.name }}</span>
          </button>
        </div>
        <button class="blank" @click="fileInput?.click()">＋ 上传贴图 (PNG/JPG)</button>
        <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="onUpload" />

        <div class="pgroup">
          <em>变形贴图</em>
          <i>{{ variantGroups.length * 10 }}</i>
          <span class="pline"></span>
        </div>
        <div class="phint">每类额外 10 种程序化变形，点缩略图直接套到选中对象。</div>
        <div class="vg" v-for="g in variantGroups" :key="g.base.id">
          <div class="vgname">{{ g.base.name }}</div>
          <div class="vrow">
            <button
              class="vtex"
              :class="{ on: curTexId === t.id }"
              v-for="(t, i) in g.items"
              :key="t.id"
              @click="pickVariant(t)"
              :title="t.name"
            >
              <img :src="thumb(t, 72)" alt="" />
              <span>{{ i + 1 }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { S, A, addTexture, selectTexture, toast, pushHistory } from '../core/store'
import { PRESETS } from '../core/presets'
import { GEO_LIST } from '../core/geometry'
import { BASE_TEXTURES, texVariant } from '../core/doc'
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

const variantGroups = computed(() =>
  BASE_TEXTURES.map((base) => ({
    base,
    items: Array.from({ length: 10 }, (_, k) => texVariant(base, k + 1))
  }))
)

const curTexId = computed(() => {
  const obj = A.selected
  if (!obj) return ''
  return obj.kind === 'particles' ? obj.render.textureId : obj.material.textureId
})

const fileInput = ref<HTMLInputElement>()
const thumbCache = new Map<string, string>()

function thumb(t: TextureAsset, size = 96): string {
  if (t.dataUrl) return t.dataUrl
  const key = `${t.id}|${t.gen}|${t.params.seed}|${t.params.softness}|${t.params.variant ?? 0}|${size}`
  let v = thumbCache.get(key)
  if (!v) {
    v = canvasToDataURL(t.gen, t.params, size)
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

function pickVariant(asset: TextureAsset) {
  if (!S.selectedId) {
    toast('先选中一个对象，再点击贴图应用', 'warn')
    return
  }
  const exist = S.doc.textures.find((t) => t.id === asset.id)
  if (!exist) addTexture({ ...asset })
  selectTexture(asset.id)
  toast(`已应用「${asset.name}」`, 'ok')
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
