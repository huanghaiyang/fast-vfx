<template>
  <aside class="panel right">
    <div class="panel-head">
      <span class="panel-title">{{ S.keySel.length ? '关键帧' : sel ? '属性' : '特效设置' }}</span>
      <span class="tag" v-if="S.keySel.length">{{ S.keySel.length === 2 ? '两帧比对' : '单帧' }}</span>
      <span class="tag" v-else-if="sel">{{ sel.kind === 'particles' ? '粒子' : '模型' }}</span>
    </div>

    <div class="panel-body">
      <KeyframeInspector v-if="S.keySel.length" />
      <template v-else-if="sel">
        <div class="obj-head">
          <input class="obj-name" type="text" v-model="sel.name" spellcheck="false" @focus="pushHistory" />
          <button class="icon ghost" :title="sel.visible ? '隐藏' : '显示'" @click="sel.visible = !sel.visible">
            {{ sel.visible ? '◉' : '○' }}
          </button>
          <button class="icon ghost" title="复制" @click="A.duplicate()">⧉</button>
          <button class="icon ghost danger" title="删除" @click="A.remove()">✕</button>
        </div>

        <Section title="变换">
          <VecField label="位置" :model-value="sel.transform.position" :step="0.05" @begin="pushHistory" @update:model-value="setVec('position', $event)" />
          <VecField label="旋转°" :model-value="sel.transform.rotation" :step="1" :digits="1" @begin="pushHistory" @update:model-value="setVec('rotation', $event)" />
          <VecField label="缩放" :model-value="sel.transform.scale" :step="0.05" @begin="pushHistory" @update:model-value="setVec('scale', $event)" />
          <div class="keyrow">
            <button class="keybtn" :class="{ on: hasTrack('position') }" @click="key('position')">● 位置</button>
            <button class="keybtn" :class="{ on: hasTrack('rotation') }" @click="key('rotation')">● 旋转</button>
            <button class="keybtn" :class="{ on: hasTrack('scale') }" @click="key('scale')">● 缩放</button>
          </div>
          <div class="keyrow">
            <button class="keybtn" :class="{ on: hasTrack('opacity') }" @click="key('opacity')">● 透明度</button>
            <button class="keybtn" @click="quickRotate(-90)">俯仰 -90°</button>
            <button class="keybtn" @click="resetRotation">重置旋转</button>
          </div>
        </Section>

        <ParticleInspector v-if="sel.kind === 'particles'" :p="sel" />
        <ModelInspector v-else :m="sel" />
      </template>

      <template v-else>
        <Section title="时间轴">
          <SliderRow label="时长 / 秒" :model-value="S.doc.duration" :min="0.2" :max="12" :step="0.01" @begin="pushHistory" @update:model-value="setDuration" />
          <div class="row2">
            <span class="rl">循环播放</span>
            <button class="toggle" :class="{ on: S.doc.loop }" @click="toggleLoop">{{ S.doc.loop ? '循环' : '单次' }}</button>
          </div>
          <div class="row2">
            <span class="rl">自动 K 帧</span>
            <button class="toggle" :class="{ on: S.autoKey }" @click="S.autoKey = !S.autoKey">{{ S.autoKey ? '开启' : '关闭' }}</button>
          </div>
          <div class="hint">开启后，拖动变换手柄会自动在当前播放头写入关键帧。</div>
        </Section>

        <Section title="画面">
          <div class="row2">
            <span class="rl">背景色</span>
            <input type="color" :value="S.doc.bg" @focus="pushHistory" @input="S.doc.bg = ($event.target as HTMLInputElement).value" />
          </div>
          <SliderRow label="泛光强度" :model-value="S.doc.bloomStrength" :min="0" :max="3" :step="0.01" @begin="pushHistory" @update:model-value="S.doc.bloomStrength = $event" />
          <div class="row2">
            <span class="rl">泛光</span>
            <button class="toggle" :class="{ on: S.doc.bloom }" @click="S.doc.bloom = !S.doc.bloom">{{ S.doc.bloom ? '开启' : '关闭' }}</button>
          </div>
          <div class="row2">
            <span class="rl">网格</span>
            <button class="toggle" :class="{ on: S.doc.grid }" @click="S.doc.grid = !S.doc.grid">{{ S.doc.grid ? '显示' : '隐藏' }}</button>
          </div>
        </Section>

        <Section title="相机">
          <SliderRow label="视野 FOV" :model-value="S.doc.camera.fov" :min="15" :max="100" :step="1" :digits="0" @begin="pushHistory" @update:model-value="S.doc.camera.fov = $event" />
          <VecField label="机位" :model-value="S.doc.camera.position" :step="0.1" @begin="pushHistory" @update:model-value="(v) => (S.doc.camera.position = v as any)" />
          <VecField label="目标" :model-value="S.doc.camera.target" :step="0.1" @begin="pushHistory" @update:model-value="(v) => (S.doc.camera.target = v as any)" />
          <div class="keyrow">
            <button class="keybtn" @click="A.captureCamera()">记录当前机位</button>
            <button class="keybtn" @click="A.resetCamera()">重置机位</button>
          </div>
        </Section>

        <div class="empty-hint">
          <div class="eh-title">开始创作</div>
          <ul>
            <li>从左侧「预设」载入火焰 / 爆炸 / 法阵等模板</li>
            <li>或从「模型」添加几何体、在「贴图」挑选粒子素材</li>
            <li>视口中选中对象后，这里会显示全部参数</li>
            <li>完成后点顶部「导出 Godot」，获得可拖入 Godot 4 的压缩包</li>
          </ul>
        </div>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { S, A, pushHistory } from '../core/store'
import type { TrackProperty, Vec3 } from '../core/types'
import Section from './ui/Section.vue'
import SliderRow from './ui/SliderRow.vue'
import VecField from './ui/VecField.vue'
import ParticleInspector from './ParticleInspector.vue'
import ModelInspector from './ModelInspector.vue'
import KeyframeInspector from './KeyframeInspector.vue'

const sel = computed(() => S.doc.objects.find((o) => o.id === S.selectedId) || null)

function hasTrack(prop: TrackProperty) {
  if (!S.selectedId) return false
  return S.doc.tracks.some((t) => t.targetId === S.selectedId && t.property === prop)
}

function key(prop: TrackProperty) {
  A.addKeyframe(prop)
}

function setVec(prop: 'position' | 'rotation' | 'scale', v: number[]) {
  if (!sel.value) return
  sel.value.transform[prop] = v as Vec3
}

function resetRotation() {
  if (!sel.value) return
  pushHistory()
  sel.value.transform.rotation = [0, 0, 0]
}

function quickRotate(deg: number) {
  if (!sel.value) return
  pushHistory()
  const r = sel.value.transform.rotation
  sel.value.transform.rotation = [r[0] + deg, r[1], r[2]]
}

function setDuration(v: number) {
  S.doc.duration = Math.max(0.2, v)
  if (S.time > S.doc.duration) S.time = S.doc.duration
}

function toggleLoop() {
  pushHistory()
  S.doc.loop = !S.doc.loop
}
</script>
