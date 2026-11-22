<template>
  <div>
    <Section title="发射">
      <SliderRow label="速率 / 秒" :model-value="p.emission.rate" :min="0" :max="900" :step="1" :digits="0" @begin="edit" @update:model-value="p.emission.rate = $event" />
      <div class="row2">
        <span class="rl">形状</span>
        <select v-model="p.emission.shape">
          <option value="point">点</option>
          <option value="sphere">球体</option>
          <option value="box">长方体</option>
          <option value="cone">锥形</option>
          <option value="circle">圆面</option>
          <option value="ring">圆环</option>
        </select>
      </div>
      <div class="row2" v-if="p.emission.shape === 'sphere'">
        <span class="rl">表面发射</span>
        <button class="toggle" :class="{ on: p.emission.surface }" @click="p.emission.surface = !p.emission.surface">
          {{ p.emission.surface ? '仅表面' : '球体内部' }}
        </button>
      </div>
      <SliderRow v-if="p.emission.shape !== 'box'" label="半径" :model-value="p.emission.radius" :min="0.01" :max="3" :step="0.01" @begin="edit" @update:model-value="p.emission.radius = $event" />
      <SliderRow v-if="p.emission.shape === 'cone'" label="锥角" :model-value="p.emission.coneAngle" :min="0" :max="90" :step="0.5" :digits="1" @begin="edit" @update:model-value="p.emission.coneAngle = $event" />
      <VecField v-if="p.emission.shape === 'box'" label="尺寸" :model-value="p.emission.size" @begin="edit" @update:model-value="(v) => (p.emission.size = v as any)" />

      <div class="row2">
        <span class="rl">寿命</span>
        <div class="inline">
          <NumberField :model-value="p.emission.lifetimeMin" :min="0.02" :step="0.05" @begin="edit" @update:model-value="p.emission.lifetimeMin = $event" />
          <span class="tilde">~</span>
          <NumberField :model-value="p.emission.lifetimeMax" :min="0.02" :step="0.05" @begin="edit" @update:model-value="p.emission.lifetimeMax = $event" />
        </div>
      </div>

      <div class="row2">
        <span class="rl">爆发</span>
        <button class="toggle" :class="{ on: p.emission.burst }" @click="p.emission.burst = !p.emission.burst">
          {{ p.emission.burst ? '开启' : '关闭' }}
        </button>
      </div>
      <template v-if="p.emission.burst">
        <SliderRow label="单次数量" :model-value="p.emission.burstCount" :min="1" :max="2000" :step="1" :digits="0" @begin="edit" @update:model-value="p.emission.burstCount = $event" />
        <SliderRow label="间隔 / 秒" :model-value="p.emission.burstInterval" :min="0" :max="4" :step="0.01" @begin="edit" @update:model-value="p.emission.burstInterval = $event" />
      </template>
      <SliderRow label="持续 / 秒" :model-value="p.emission.duration" :min="0" :max="6" :step="0.01" @begin="edit" @update:model-value="p.emission.duration = $event" />
      <div class="hint">持续为 0 表示整段特效期间都发射。</div>
    </Section>

    <Section title="运动">
      <div class="row2">
        <span class="rl">速度</span>
        <div class="inline">
          <NumberField :model-value="p.motion.speedMin" :step="0.05" @begin="edit" @update:model-value="p.motion.speedMin = $event" />
          <span class="tilde">~</span>
          <NumberField :model-value="p.motion.speedMax" :step="0.05" @begin="edit" @update:model-value="p.motion.speedMax = $event" />
        </div>
      </div>
      <VecField label="主方向" :model-value="p.motion.direction" :step="0.05" @begin="edit" @update:model-value="(v) => (p.motion.direction = v as any)" />
      <SliderRow label="扩散角" :model-value="p.motion.spread" :min="0" :max="180" :step="1" :digits="0" @begin="edit" @update:model-value="p.motion.spread = $event" />
      <VecField label="重力" :model-value="p.motion.gravity" :step="0.1" @begin="edit" @update:model-value="(v) => (p.motion.gravity = v as any)" />
      <SliderRow label="阻尼" :model-value="p.motion.damping" :min="0" :max="8" :step="0.02" @begin="edit" @update:model-value="p.motion.damping = $event" />
      <SliderRow label="湍流" :model-value="p.motion.turbulence" :min="0" :max="6" :step="0.02" @begin="edit" @update:model-value="p.motion.turbulence = $event" />
      <SliderRow label="湍流尺度" :model-value="p.motion.turbulenceScale" :min="0.1" :max="8" :step="0.05" @begin="edit" @update:model-value="p.motion.turbulenceScale = $event" />
      <SliderRow label="径向外推" :model-value="p.motion.radial" :min="-4" :max="6" :step="0.02" @begin="edit" @update:model-value="p.motion.radial = $event" />
      <SliderRow label="漩涡" :model-value="p.motion.swirl" :min="-6" :max="6" :step="0.02" @begin="edit" @update:model-value="p.motion.swirl = $event" />
    </Section>

    <Section title="尺寸与颜色">
      <SliderRow label="基础尺寸" :model-value="p.sizeBase" :min="0.01" :max="4" :step="0.01" @begin="edit" @update:model-value="p.sizeBase = $event" />
      <div class="block-label">生命内尺寸曲线</div>
      <CurveEditor :model-value="p.sizeCurve" @begin="edit" @update:model-value="p.sizeCurve = $event" />
      <div class="block-label" style="margin-top: 12px">生命内颜色渐变</div>
      <GradientEditor :model-value="p.gradient" @begin="edit" @update:model-value="p.gradient = $event" />
      <SliderRow label="亮度" :model-value="p.brightness" :min="0.1" :max="5" :step="0.02" @begin="edit" @update:model-value="p.brightness = $event" />
    </Section>

    <Section title="旋转 / 拉伸">
      <div class="row2">
        <span class="rl">初始角</span>
        <div class="inline">
          <NumberField :model-value="p.spin.angleMin" :step="5" :digits="0" @begin="edit" @update:model-value="p.spin.angleMin = $event" />
          <span class="tilde">~</span>
          <NumberField :model-value="p.spin.angleMax" :step="5" :digits="0" @begin="edit" @update:model-value="p.spin.angleMax = $event" />
        </div>
      </div>
      <div class="row2">
        <span class="rl">自旋 °/s</span>
        <div class="inline">
          <NumberField :model-value="p.spin.speedMin" :step="5" :digits="0" @begin="edit" @update:model-value="p.spin.speedMin = $event" />
          <span class="tilde">~</span>
          <NumberField :model-value="p.spin.speedMax" :step="5" :digits="0" @begin="edit" @update:model-value="p.spin.speedMax = $event" />
        </div>
      </div>
      <SliderRow label="朝向速度" :model-value="p.spin.align" :min="0" :max="1" :step="0.01" @begin="edit" @update:model-value="p.spin.align = $event" />
      <SliderRow label="速度拉伸" :model-value="p.spin.stretch" :min="0" :max="0.2" :step="0.002" :digits="3" @begin="edit" @update:model-value="p.spin.stretch = $event" />
      <div class="hint">拉伸让火花沿运动方向变长；导出 Godot 时退化为速度朝向对齐。</div>
    </Section>

    <Section title="渲染">
      <div class="row2">
        <span class="rl">粒子贴图</span>
        <div class="inline texline">
          <img class="mini" :src="texThumb" alt="" />
          <select v-model="p.render.textureId">
            <option v-for="t in S.doc.textures" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
      </div>
      <div class="row2">
        <span class="rl">混合</span>
        <select v-model="p.render.blend">
          <option value="additive">加色 (Additive)</option>
          <option value="alpha">透明 (Alpha)</option>
          <option value="multiply">正片叠底</option>
        </select>
      </div>
      <SliderRow label="数量上限" :model-value="p.render.maxCount" :min="10" :max="8000" :step="10" :digits="0" @begin="edit" @update:model-value="p.render.maxCount = $event" />
      <SliderRow label="不透明度" :model-value="p.render.opacity" :min="0" :max="1" :step="0.01" @begin="edit" @update:model-value="p.render.opacity = $event" />
      <SliderRow label="淡入" :model-value="p.render.fadeIn" :min="0" :max="0.6" :step="0.005" :digits="3" @begin="edit" @update:model-value="p.render.fadeIn = $event" />
      <SliderRow label="淡出" :model-value="p.render.fadeOut" :min="0" :max="1" :step="0.005" :digits="3" @begin="edit" @update:model-value="p.render.fadeOut = $event" />
    </Section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ParticleDoc } from '../core/types'
import { S, pushHistory } from '../core/store'
import { canvasToDataURL } from '../core/textures'
import Section from './ui/Section.vue'
import SliderRow from './ui/SliderRow.vue'
import NumberField from './ui/NumberField.vue'
import VecField from './ui/VecField.vue'
import CurveEditor from './ui/CurveEditor.vue'
import GradientEditor from './ui/GradientEditor.vue'

const props = defineProps<{ p: ParticleDoc }>()
const edit = () => pushHistory()

const texThumb = computed(() => {
  const t = S.doc.textures.find((x) => x.id === props.p.render.textureId)
  if (!t) return ''
  if (t.dataUrl) return t.dataUrl
  return canvasToDataURL(t.gen, t.params, 64)
})
</script>
