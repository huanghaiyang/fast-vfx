<template>
  <div class="kf" v-if="track">
    <div class="kf-head">
      <div class="kf-title">
        <span class="dot"></span>
        <b>{{ obj ? obj.name : '（已删除）' }}</b>
        <span class="pr">{{ propName }}</span>
      </div>
      <button class="back" @click="A.clearKeySel()">返回属性</button>
    </div>

    <Section title="轨道">
      <div class="row2">
        <span class="rl">关键帧数</span>
        <span class="rv">{{ track.keys.length }}</span>
      </div>
      <div class="row2">
        <span class="rl">插值</span>
        <button class="toggle" :class="{ on: track.smooth }" @click="A.setTrackSmooth(track.id, !track.smooth)">
          {{ track.smooth ? '平滑' : '线性' }}
        </button>
      </div>
      <div class="row2">
        <span class="rl">播放头实测</span>
        <span class="rv mono">{{ fmtV(sampleTrack(track, S.time)) }}</span>
      </div>
      <div class="keyrow">
        <button class="keybtn" :disabled="!prevKey" @click="gotoKey(prevKey)">← 上一帧</button>
        <button class="keybtn" :disabled="!nextKey" @click="gotoKey(nextKey)">下一帧 →</button>
      </div>
      <div class="keyrow">
        <button class="keybtn cmp" :disabled="keys.length === 2 || !nextKey" @click="compareNext">
          ⇄ 对比相邻两帧
        </button>
        <button class="keybtn" :disabled="keys.length < 2" @click="A.clearKeySel()">取消比对</button>
      </div>
      <div class="kl-list" v-if="track.keys.length">
        <button
          v-for="(k, i) in track.keys"
          :key="i"
          class="kl"
          :class="{ on: S.keySel.includes(k) }"
          @click="A.selectKey(track!.id, k, false)"
        >
          {{ i + 1 }}·{{ k.t.toFixed(2) }}s
        </button>
      </div>
    </Section>

    <Section :title="keys.length > 1 ? '选中的两帧' : '选中的关键帧'">
      <div class="kf-card" v-for="(k, i) in keys" :key="i">
        <div class="kf-card-head">
          <span class="badge" :class="keys.length > 1 ? (i === 0 ? 'a' : 'b') : 'a'">
            {{ keys.length > 1 ? (i === 0 ? 'A · 前' : 'B · 后') : '帧' }}
          </span>
          <span class="idx">#{{ indexOf(k) + 1 }}</span>
          <span class="grow"></span>
          <button class="mini-btn" title="播放头跳到该帧" @click="seek(k)">定位</button>
          <button class="mini-btn danger" title="删除该帧" @click="removeKey(k)">删除</button>
        </div>
        <div class="kf-row">
          <span class="rl">时间 / 秒</span>
          <NumberField :model-value="k.t" :step="0.01" :min="0" :max="S.doc.duration" :digits="3" @update:model-value="setT(k, $event)" />
        </div>
        <div class="kf-row" v-if="isVec(k)">
          <span class="rl">数值</span>
          <VecField :model-value="k.v as number[]" :step="0.05" @update:model-value="setV(k, $event)" />
        </div>
        <div class="kf-row" v-else>
          <span class="rl">数值</span>
          <NumberField :model-value="k.v as number" :step="0.01" :digits="3" @update:model-value="setV(k, $event)" />
        </div>
      </div>
    </Section>

    <Section v-if="cmp" title="帧间比对">
      <div class="kf-diff" v-if="cmp">
        <div class="drow">
          <span class="dl">时间间隔 Δt</span>
          <span class="dv mono">{{ cmp.dt.toFixed(3) }} s</span>
        </div>
        <div class="drow" v-if="!cmp.vec">
          <span class="dl">数值变化 Δ</span>
          <span class="dv mono" :class="signCls(cmp.d as number)">{{ signed(cmp.d as number) }}</span>
        </div>
        <div class="drow" v-if="!cmp.vec && cmp.ratio !== null">
          <span class="dl">相对变化</span>
          <span class="dv mono" :class="signCls(cmp.ratio as number)">{{ signed(cmp.ratio as number) }} %</span>
        </div>
        <div class="drow" v-if="!cmp.vec">
          <span class="dl">变化速率</span>
          <span class="dv mono">{{ (cmp.rate as number).toFixed(3) }} /s</span>
        </div>

        <div class="drow" v-if="cmp.vec">
          <span class="dl">位移距离</span>
          <span class="dv mono">{{ (cmp.dist as number).toFixed(3) }} m</span>
        </div>
        <div class="drow" v-if="cmp.vec">
          <span class="dl">平均速度</span>
          <span class="dv mono accent">{{ (cmp.speed as number).toFixed(3) }} m/s</span>
        </div>

        <div class="dgrid" v-if="cmp.vec">
          <div class="dcell" v-for="(ax, i) in ['x', 'y', 'z']" :key="ax">
            <span class="ax" :class="ax">{{ ax }}</span>
            <span class="mono" :class="signCls((cmp.d as number[])[i])">{{ signed((cmp.d as number[])[i]) }}</span>
            <span class="sub mono">{{ ((cmp.axisSpeed as number[])[i]).toFixed(2) }}/s</span>
          </div>
        </div>

        <div class="notch" v-if="!adjacent">注意：这两帧中间还隔着 {{ gap - 1 }} 帧，比对的是整段跨度</div>
        <div class="notch" v-else-if="cmp.dt < 1e-6">两帧时间重合，Δ 无意义（可先拖开其中一帧）</div>
      </div>
    </Section>

    <div class="hint kf-hint">在时间轴上 Shift 点选同一条轨道的第二帧即可进入比对；点空白处取消选择。</div>
  </div>
  <div v-else class="hint">关键帧已失效，请重新选择。</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { S, A, trackOfKey } from '../core/store'
import { sampleTrack } from '../core/curve'
import type { Keyframe, TrackProperty, Vec3 } from '../core/types'
import Section from './ui/Section.vue'
import NumberField from './ui/NumberField.vue'
import VecField from './ui/VecField.vue'

const PROP: Record<TrackProperty, string> = {
  position: '位置',
  rotation: '旋转',
  scale: '缩放',
  opacity: '透明度',
  radius: '范围',
  clusters: '簇',
  size: '尺寸'
}

const track = computed(() => (S.keySel.length ? trackOfKey(S.keySel[0]) : null))
const obj = computed(() => S.doc.objects.find((o) => o.id === track.value?.targetId) || null)
const propName = computed(() => (track.value ? PROP[track.value.property] : ''))
const keys = computed(() => S.keySel.slice().sort((a, b) => a.t - b.t))

function indexOf(k: Keyframe) {
  return track.value ? track.value.keys.indexOf(k) : -1
}

const prevKey = computed(() => {
  const tr = track.value
  if (!tr) return null
  const i = indexOf(keys.value[0])
  return i > 0 ? tr.keys[i - 1] : null
})
const nextKey = computed(() => {
  const tr = track.value
  if (!tr) return null
  const i = indexOf(keys.value[keys.value.length - 1])
  return i >= 0 && i < tr.keys.length - 1 ? tr.keys[i + 1] : null
})

const gap = computed(() => {
  const tr = track.value
  if (!tr || keys.value.length < 2) return 0
  return Math.abs(indexOf(keys.value[1]) - indexOf(keys.value[0]))
})
const adjacent = computed(() => gap.value === 1)

const cmp = computed(() => {
  if (keys.value.length < 2) return null
  const [a, b] = keys.value
  const dt = b.t - a.t
  if (Array.isArray(a.v) && Array.isArray(b.v)) {
    const d = [b.v[0] - a.v[0], b.v[1] - a.v[1], b.v[2] - a.v[2]]
    const dist = Math.hypot(d[0], d[1], d[2])
    return {
      vec: true as const,
      dt,
      dist,
      d: d as number[],
      speed: dt > 1e-6 ? dist / dt : 0,
      axisSpeed: d.map((x) => (dt > 1e-6 ? x / dt : 0)) as number[],
      rate: 0,
      ratio: null as number | null
    }
  }
  const va = a.v as number
  const vb = b.v as number
  const d = vb - va
  return {
    vec: false as const,
    dt,
    dist: 0,
    d,
    speed: 0,
    axisSpeed: [],
    rate: dt > 1e-6 ? d / dt : 0,
    ratio: va !== 0 ? (vb / va - 1) * 100 : null
  }
})

function isVec(k: Keyframe) {
  return Array.isArray(k.v)
}

function fmtV(v: number | Vec3 | null) {
  if (v === null) return '—'
  if (Array.isArray(v)) return v.map((n) => n.toFixed(2)).join(', ')
  return v.toFixed(3)
}

function signed(n: number) {
  return `${n > 0 ? '+' : ''}${n.toFixed(3)}`
}

function signCls(n: number) {
  return n > 0 ? 'up' : n < 0 ? 'down' : ''
}

function setT(k: Keyframe, t: number) {
  if (!track.value) return
  A.setKeyTime(track.value.id, k, t)
  S.time = k.t
}

function setV(k: Keyframe, v: number | number[]) {
  A.setKeyValue(k, Array.isArray(v) ? (v as Vec3) : v)
}

function seek(k: Keyframe) {
  S.playing = false
  S.time = k.t
}

function gotoKey(k: Keyframe | null) {
  if (!k || !track.value) return
  A.selectKey(track.value.id, k, false)
}

/** 一键把当前帧与轨道里的下一帧配对，直接进入比对 */
function compareNext() {
  const tr = track.value
  const k = nextKey.value
  if (!tr || !k) return
  const cur = S.keySel[0]
  if (cur) A.selectKey(tr.id, k, true)
}

function removeKey(k: Keyframe) {
  if (!track.value) return
  const i = indexOf(k)
  if (i >= 0) A.removeKey(track.value.id, i)
}
</script>

<style scoped>
.kf {
  padding-top: 6px;
}
.kf-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 10px;
}
.kf-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  min-width: 0;
}
.kf-title b {
  color: #e6ebf7;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}
.kf-title .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 8px var(--cyan);
}
.kf-title .pr {
  color: var(--dim-2);
  font-size: 10.5px;
  border: 1px solid var(--line-soft);
  border-radius: 4px;
  padding: 1px 5px;
}
.back {
  margin-left: auto;
  font-size: 10.5px;
  padding: 3px 8px;
  color: var(--dim);
}
.back:hover {
  color: var(--accent);
  border-color: rgba(255, 138, 61, 0.35);
}
.rv {
  font-size: 11px;
  color: #c9d1e4;
}
.mono {
  font-variant-numeric: tabular-nums;
}
.keyrow .keybtn.cmp {
  color: var(--cyan);
  border-color: rgba(94, 200, 255, 0.32);
  background: rgba(94, 200, 255, 0.07);
}
.keyrow .keybtn.cmp:disabled {
  color: var(--dim-2);
  background: transparent;
  border-color: var(--line-soft);
}
.kl-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 7px;
}
.kl {
  font-size: 9.5px;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--dim);
  background: #0c0e15;
  font-variant-numeric: tabular-nums;
}
.kl.on {
  color: var(--cyan);
  border-color: rgba(94, 200, 255, 0.45);
  background: rgba(94, 200, 255, 0.1);
}
.kf-card {
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  padding: 7px 8px;
  margin-bottom: 7px;
  background: #0c0e16;
}
.kf-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 7px;
}
.badge {
  font-size: 9.5px;
  letter-spacing: 0.05em;
  padding: 1px 5px;
  border-radius: 3px;
}
.badge.a {
  color: var(--accent);
  background: rgba(255, 138, 61, 0.12);
  border: 1px solid rgba(255, 138, 61, 0.3);
}
.badge.b {
  color: var(--cyan);
  background: rgba(94, 200, 255, 0.12);
  border: 1px solid rgba(94, 200, 255, 0.3);
}
.idx {
  font-size: 10px;
  color: var(--dim-2);
  font-variant-numeric: tabular-nums;
}
.grow {
  flex: 1;
}
.mini-btn {
  font-size: 10px;
  padding: 2px 7px;
}
.mini-btn.danger:hover {
  color: var(--red);
  border-color: rgba(255, 95, 109, 0.4);
}
.kf-row {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  margin-top: 5px;
}
.kf-row .rl {
  font-size: 10.5px;
  color: var(--dim);
}
.kf-diff {
  border: 1px solid rgba(94, 200, 255, 0.22);
  background: rgba(94, 200, 255, 0.05);
  border-radius: 6px;
  padding: 8px;
}
.drow {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
  padding: 2px 0;
}
.dl {
  color: var(--dim);
  flex: 1;
}
.dv {
  color: #dbe3f2;
}
.dv.accent {
  color: var(--cyan);
}
.dv.up,
.dcell .up {
  color: #ffb072;
}
.dv.down,
.dcell .down {
  color: #7fd6a8;
}
.dgrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  margin-top: 7px;
}
.dcell {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: #0a0d15;
  border-radius: 5px;
  padding: 4px 6px;
  font-size: 10.5px;
}
.dcell .ax {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
}
.dcell .sub {
  color: var(--dim-2);
  font-size: 9.5px;
}
.notch {
  margin-top: 7px;
  font-size: 10px;
  color: #d0a04a;
  line-height: 1.5;
}
.kf-hint {
  padding: 10px 12px;
}
</style>
