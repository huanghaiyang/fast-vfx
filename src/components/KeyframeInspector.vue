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

    <Section v-if="keys.length === 1" title="该帧属性快照">
      <div class="snap" v-for="r in snapshot" :key="r.k">
        <span class="sl">{{ r.k }}</span>
        <span class="sv mono" :class="{ hot: r.isCur }">{{ r.v }}</span>
      </div>
      <div class="snap static" v-for="r in statics" :key="r.k">
        <span class="sl">{{ r.k }}</span>
        <span class="sv mono">{{ r.v }}</span>
      </div>
      <div class="hint snap-hint">
        按该帧时间 {{ (keys[0]?.t ?? 0).toFixed(2) }}s 采样其他轨道；灰底为对象静态参数（不受关键帧影响）。
      </div>
    </Section>

    <Section v-if="cmp" title="帧间比对">
      <div class="kf-diff" v-if="cmp">
        <div class="cmp-head">
          <span class="ca">A · {{ keys[0]?.t.toFixed(2) }}s</span>
          <span class="cl">变化项</span>
          <span class="cb">B · {{ keys[1]?.t.toFixed(2) }}s</span>
        </div>

        <div class="cmp-rows">
          <div class="cmp-row" v-for="r in diffRows" :key="r.k">
            <span class="cv mono ca-v">{{ r.a }}</span>
            <span class="cl">
              {{ r.label }}
              <em class="d mono" :class="r.up ? 'up' : 'down'">{{ r.d }}</em>
            </span>
            <span class="cv mono cb-v">{{ r.b }}</span>
          </div>
        <div class="cmp-none" v-if="!diffRows.length">两帧数值完全一致（只有时间不同）</div>
        </div>

        <div class="drow">
          <span class="dl">时间间隔 Δt</span>
          <span class="dv mono">{{ cmp.dt.toFixed(3) }} s</span>
        </div>
        <div class="drow" v-if="moveDist !== null">
          <span class="dl">位移距离 / 平均速度</span>
          <span class="dv mono accent">{{ moveDist.toFixed(3) }} m · {{ moveSpeed.toFixed(3) }} m/s</span>
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
  return { dt: b.t - a.t }
})

/** 左右两栏逐项对照：该对象所有轨道分别在 A / B 时刻采样，只留真正变化的项 */
const diffRows = computed(() => {
  const o = obj.value
  const [a, b] = keys.value
  if (!o || !b) return [] as Array<{ k: string; label: string; a: string; b: string; d: string; up: boolean }>
  const rows: Array<{ k: string; label: string; a: string; b: string; d: string; up: boolean }> = []
  const AX: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z']
  for (const tr of S.doc.tracks) {
    if (tr.targetId !== o.id || !tr.keys.length) continue
    const va = sampleTrack(tr, a.t)
    const vb = sampleTrack(tr, b.t)
    if (va === null || vb === null) continue
    if (Array.isArray(va) && Array.isArray(vb)) {
      for (let i = 0; i < 3; i++) {
        const dv = vb[i] - va[i]
        if (Math.abs(dv) < 1e-4) continue
        rows.push({
          k: `${tr.id}_${AX[i]}`,
          label: `${PROP[tr.property]} · ${AX[i]}`,
          a: va[i].toFixed(3),
          b: vb[i].toFixed(3),
          d: signed(dv),
          up: dv > 0
        })
      }
    } else if (typeof va === 'number' && typeof vb === 'number') {
      const dv = vb - va
      if (Math.abs(dv) < 1e-4) continue
      const pct = Math.abs(va) > 1e-6 ? ` (${signed(dv / Math.abs(va) * 100)}%)` : ''
      rows.push({
        k: tr.id,
        label: PROP[tr.property],
        a: va.toFixed(3),
        b: vb.toFixed(3),
        d: signed(dv) + pct,
        up: dv > 0
      })
    }
  }
  return rows
})

/** 位置轨位移距离与平均速度（没有位置轨就是 null） */
const moveDist = computed(() => moveInfo.value?.dist ?? null)
const moveSpeed = computed(() => moveInfo.value?.speed ?? 0)
const moveInfo = computed(() => {
  const o = obj.value
  const [a, b] = keys.value
  if (!o || !b) return null
  const tr = S.doc.tracks.find((t) => t.targetId === o.id && t.property === 'position' && t.keys.length)
  if (!tr) return null
  const va = sampleTrack(tr, a.t)
  const vb = sampleTrack(tr, b.t)
  if (!Array.isArray(va) || !Array.isArray(vb)) return null
  const dist = Math.hypot(vb[0] - va[0], vb[1] - va[1], vb[2] - va[2])
  const dt = b.t - a.t
  return { dist, speed: dt > 1e-6 ? dist / dt : 0 }
})


function isVec(k: Keyframe) {
  return Array.isArray(k.v)
}

/** 单帧选中时：该对象所有轨道在 key.t 时刻的采样值 */
const snapshot = computed(() => {
  const o = obj.value
  const k = keys.value[0]
  if (!o || !k) return []
  const cur = track.value?.property
  return S.doc.tracks
    .filter((t) => t.targetId === o.id)
    .map((t) => ({
      k: PROP[t.property] + (t.property === cur ? '（当前帧）' : ''),
      v: fmtV(sampleTrack(t, k.t)),
      isCur: t.property === cur
    }))
})

/** 该对象的静态参数（不参与关键帧），方便对照这个时刻的形态 */
const statics = computed(() => {
  const o = obj.value
  if (!o) return []
  if (o.kind === 'particles') {
    const tex = S.doc.textures.find((t) => t.id === o.render.textureId)
    return [
      { k: '发射率 / 秒', v: o.emission.burst ? `爆发 ${o.emission.burstCount}` : o.emission.rate.toFixed(0) },
      { k: '寿命 / 秒', v: `${o.emission.lifetimeMin.toFixed(2)}~${o.emission.lifetimeMax.toFixed(2)}` },
      { k: '初始尺寸', v: o.sizeBase.toFixed(3) },
      { k: '亮度', v: o.brightness.toFixed(2) },
      { k: '贴图', v: tex ? tex.name : '（无）' },
      { k: '混合', v: o.render.blend }
    ]
  }
  const p = o.params
  return [
    { k: '几何', v: o.geometry },
    { k: '半径 / 尺寸', v: (p.radius ?? p.size ?? 1).toFixed(3) },
    { k: '颜色', v: o.material.color },
    { k: '自发光', v: `${o.material.emissive} × ${o.material.emissiveIntensity.toFixed(2)}` }
  ]
})

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
.cmp-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px minmax(0, 1fr);
  gap: 6px;
  padding: 3px 5px 5px;
  border-bottom: 1px solid rgba(94, 200, 255, 0.18);
  margin-bottom: 4px;
}
.cmp-head .ca,
.cmp-head .cb {
  font-size: 10px;
  font-weight: 600;
  color: var(--cyan);
  font-variant-numeric: tabular-nums;
}
.cmp-head .cb {
  text-align: right;
  color: var(--accent);
}
.cmp-head .cl {
  font-size: 9.5px;
  color: var(--dim-2);
  text-align: center;
}
.cmp-rows {
  max-height: 260px;
  overflow-y: auto;
}
.cmp-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px minmax(0, 1fr);
  gap: 6px;
  align-items: baseline;
  padding: 3px 5px;
  border-radius: 4px;
  font-size: 10.5px;
}
.cmp-row:nth-child(odd) {
  background: #0a0d15;
}
.cv {
  color: #dbe3f2;
  font-size: 11px;
}
.ca-v {
  color: #a9d8f2;
}
.cb-v {
  text-align: right;
  color: #ffcda3;
}
.cmp-row .cl {
  color: var(--dim);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0px;
  line-height: 1.25;
}
.cmp-row .cl em {
  font-style: normal;
  font-size: 9.5px;
  color: var(--dim-2);
}
.cmp-row .cl em.up {
  color: #ffb072;
}
.cmp-row .cl em.down {
  color: #7fd6a8;
}
.cmp-none {
  padding: 8px 5px;
  font-size: 10.5px;
  color: var(--dim-2);
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
.snap {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 6px;
  align-items: baseline;
  padding: 3px 5px;
  border-radius: 4px;
  font-size: 10.5px;
}
.snap:nth-child(odd) {
  background: #0a0d15;
}
.snap.static {
  color: var(--dim-2);
}
.snap .sl {
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.snap .sv {
  color: #cdd6e8;
  text-align: right;
}
.snap .sv.hot {
  color: var(--accent);
  font-weight: 600;
}
.snap.static .sv {
  color: var(--dim);
}
.snap-hint {
  margin-top: 8px;
  line-height: 1.5;
}
.kf-hint {
  padding: 10px 12px;
}
</style>
