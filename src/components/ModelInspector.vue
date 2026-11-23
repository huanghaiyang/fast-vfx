<template>
  <div>
    <Section title="几何体">
      <div class="row2">
        <span class="rl">类型</span>
        <select :value="m.geometry" @change="changeKind(($event.target as HTMLSelectElement).value)">
          <option v-for="g in GEO_LIST" :key="g.kind" :value="g.kind">{{ g.label }} · {{ g.hint }}</option>
        </select>
      </div>
      <SliderRow v-if="hasSize" :label="sizeLabel" :model-value="m.params.size" :min="0.05" :max="6" :step="0.01" @begin="edit" @update:model-value="m.params.size = $event" />
      <SliderRow v-if="hasRadius" label="半径" :model-value="m.params.radius" :min="0.02" :max="4" :step="0.01" @begin="edit" @update:model-value="m.params.radius = $event" />
      <SliderRow v-if="hasTube" label="管径" :model-value="m.params.tube" :min="0.01" :max="1.2" :step="0.01" @begin="edit" @update:model-value="m.params.tube = $event" />
      <SliderRow v-if="hasThickness" label="厚度" :model-value="m.params.thickness" :min="0.01" :max="1.2" :step="0.01" @begin="edit" @update:model-value="m.params.thickness = $event" />
      <SliderRow v-if="m.geometry === 'arc'" label="扫掠角" :model-value="m.params.angle" :min="5" :max="359" :step="1" :digits="0" @begin="edit" @update:model-value="m.params.angle = $event" />
      <SliderRow v-if="hasSeg" label="分段" :model-value="m.params.segments" :min="3" :max="160" :step="1" :digits="0" @begin="edit" @update:model-value="m.params.segments = $event" />
      <SliderRow v-if="isDeform" label="细分" :model-value="m.params.detail" :min="0" :max="3" :step="1" :digits="0" @begin="edit" @update:model-value="m.params.detail = $event" />
      <SliderRow v-if="isDeform" label="形变" :model-value="m.params.deform" :min="0" :max="1" :step="0.01" @begin="edit" @update:model-value="m.params.deform = $event" />
      <SliderRow v-if="isDeform" label="随机种子" :model-value="m.params.seed" :min="1" :max="60" :step="1" :digits="0" @begin="edit" @update:model-value="m.params.seed = $event" />
      <div class="row2">
        <span class="rl">变种</span>
        <div class="vchips">
          <button
            class="vchip"
            v-for="v in MODEL_VARIANTS"
            :key="v.id"
            :class="{ on: (m.params.variant ?? 0) === v.id }"
            :title="v.hint"
            @click="setVariant(v.id)"
          >
            {{ v.name }}
          </button>
        </div>
      </div>
      <div class="vhint">{{ variantHint }}</div>
    </Section>

    <Section title="材质">
      <div class="row2">
        <span class="rl">基础色</span>
        <input type="color" :value="m.material.color" @focus="edit" @input="m.material.color = ($event.target as HTMLInputElement).value" />
      </div>
      <div class="row2">
        <span class="rl">自发光</span>
        <input type="color" :value="m.material.emissive" @focus="edit" @input="m.material.emissive = ($event.target as HTMLInputElement).value" />
      </div>
      <SliderRow label="发光强度" :model-value="m.material.emissiveIntensity" :min="0" :max="12" :step="0.05" @begin="edit" @update:model-value="m.material.emissiveIntensity = $event" />
      <SliderRow label="金属度" :model-value="m.material.metalness" :min="0" :max="1" :step="0.01" @begin="edit" @update:model-value="m.material.metalness = $event" />
      <SliderRow label="粗糙度" :model-value="m.material.roughness" :min="0" :max="1" :step="0.01" @begin="edit" @update:model-value="m.material.roughness = $event" />
      <SliderRow label="不透明度" :model-value="m.material.opacity" :min="0" :max="1" :step="0.01" @begin="edit" @update:model-value="m.material.opacity = $event" />
      <div class="row2">
        <span class="rl">混合模式</span>
        <select v-model="m.material.blend">
          <option value="opaque">不透明</option>
          <option value="alpha">透明</option>
          <option value="additive">加色发光</option>
        </select>
      </div>
      <div class="row2">
        <span class="rl">贴图</span>
        <div class="inline texline">
          <img class="mini" :src="texThumb" alt="" />
          <select v-model="m.material.textureId">
            <option value="">（无）</option>
            <option v-for="t in S.doc.textures" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
      </div>
      <SliderRow v-if="m.material.textureId" label="UV 重复" :model-value="m.material.uvRepeat" :min="1" :max="8" :step="1" :digits="0" @begin="edit" @update:model-value="m.material.uvRepeat = $event" />
      <div class="row2">
        <span class="rl">线框</span>
        <button class="toggle" :class="{ on: m.material.wireframe }" @click="m.material.wireframe = !m.material.wireframe">
          {{ m.material.wireframe ? '开启' : '关闭' }}
        </button>
      </div>
      <div class="row2">
        <span class="rl">平面着色</span>
        <button class="toggle" :class="{ on: m.material.flatShading }" @click="m.material.flatShading = !m.material.flatShading">
          {{ m.material.flatShading ? '开启' : '关闭' }}
        </button>
      </div>
    </Section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { GeoKind, ModelDoc } from '../core/types'
import { defaultParams } from '../core/types'
import { GEO_LIST, MODEL_VARIANTS } from '../core/geometry'
import { S, pushHistory } from '../core/store'
import { canvasToDataURL } from '../core/textures'
import Section from './ui/Section.vue'
import SliderRow from './ui/SliderRow.vue'

const props = defineProps<{ m: ModelDoc }>()
const edit = () => pushHistory()

const hasSize = computed(() => ['box', 'plane', 'cone', 'cylinder', 'capsule'].includes(props.m.geometry))
const sizeLabel = computed(() => (['box', 'plane'].includes(props.m.geometry) ? '边长' : '高度'))
const hasRadius = computed(
  () => !['box', 'plane'].includes(props.m.geometry)
)
const hasTube = computed(() => ['torus', 'torusKnot'].includes(props.m.geometry))
const hasThickness = computed(() => ['ring', 'arc'].includes(props.m.geometry))
const hasSeg = computed(() => !['box', 'icosahedron', 'crystal', 'rock'].includes(props.m.geometry))
const isDeform = computed(() => ['crystal', 'rock'].includes(props.m.geometry))

const texThumb = computed(() => {
  const t = S.doc.textures.find((x) => x.id === props.m.material.textureId)
  if (!t) return ''
  if (t.dataUrl) return t.dataUrl
  return canvasToDataURL(t.gen, t.params, 64)
})

function changeKind(kind: string) {
  edit()
  props.m.geometry = kind as GeoKind
  const def = defaultParams(kind as GeoKind)
  const keep = { ...props.m.params }
  props.m.params = { ...def, seed: keep.seed || def.seed, variant: keep.variant ?? 0 }
}

const variantHint = computed(() => {
  const v = MODEL_VARIANTS.find((x) => x.id === (props.m.params.variant ?? 0))
  return v ? `${v.name} · ${v.hint}` : ''
})

function setVariant(id: number) {
  edit()
  props.m.params.variant = id
}
</script>
