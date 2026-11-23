<template>
  <section class="timeline panel">
    <div class="tl-bar">
      <button class="play" @click="A.togglePlay()" :title="S.playing ? '暂停 (空格)' : '播放 (空格)'">
        {{ S.playing ? '❚❚' : '▶' }}
      </button>
      <div class="clock">
        <span class="cur">{{ S.time.toFixed(2) }}</span>
        <span class="tot">/ {{ S.doc.duration.toFixed(2) }} s</span>
      </div>
      <button class="icon" title="回到起点" @click="A.setTime(0)">⟲</button>
      <div class="seg">
        <button :class="{ on: S.doc.loop }" @click="toggleLoop">循环</button>
        <button :class="{ on: S.autoKey }" @click="S.autoKey = !S.autoKey">自动 K</button>
      </div>
      <div class="spacer"></div>
      <div class="cmp" v-if="S.keySel.length === 2">
        <span class="cmp-l">{{ S.keySel[0].t.toFixed(2) }}s</span>
        <span class="cmp-m">⇄ 对比</span>
        <span class="cmp-l">{{ S.keySel[1].t.toFixed(2) }}s</span>
      </div>
      <span class="hint tl-hint" v-if="S.keySel.length !== 2">拖 ◆ 改时间 · 双击 ◆ 删除 · Shift 点两帧对比</span>
      <button class="primary mini" :disabled="!S.selectedId" @click="addAllKeys">＋ 关键帧</button>
    </div>

    <div class="tl-main">
      <div class="tl-labels">
        <div class="lbl-head">轨道</div>
        <div class="lbl" v-for="r in rows" :key="r.id" :class="{ sel: r.targetId === S.selectedId }" @click="S.selectedId = r.targetId">
          <span class="nm">{{ r.objName }}</span>
          <span class="pr">{{ r.propName }}</span>
          <button class="del" title="删除轨道" @click.stop="removeTrack(r.id)">×</button>
        </div>
        <div class="lbl empty" v-if="!rows.length">暂无关键帧轨道</div>
      </div>

      <div class="tl-area" ref="area" @pointerdown="onAreaDown">
        <div class="ruler">
          <div class="tick" v-for="tk in ticks" :key="tk.t" :style="{ left: tk.pct + '%' }">
            <span class="tl-label">{{ tk.label }}</span>
          </div>
        </div>

        <div class="lane" v-for="r in rows" :key="r.id" :class="{ sel: r.targetId === S.selectedId }">
          <div
            v-for="(k, i) in r.keys"
            :key="i"
            class="key"
            :class="{ drag: dragKey === r.id + ':' + i, sel: S.keySel.includes(k), cmp: S.keySel.length === 2 && S.keySel.includes(k) }"
            :style="{ left: Math.min(99.2, (k.t / S.doc.duration) * 100) + '%' }"
            :title="k.t.toFixed(2) + 's（Shift 点击可对比相邻两帧）'"
            @pointerdown.stop="startKeyDrag(r.id, i, $event, k)"
            @dblclick.stop="A.removeKey(r.id, i)"
          ></div>
        </div>

        <div class="playhead" :style="{ left: (S.time / S.doc.duration) * 100 + '%' }"></div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { S, A, pushHistory } from '../core/store'
import type { Keyframe, TrackProperty } from '../core/types'

const area = ref<HTMLDivElement>()
const dragKey = ref('')

const PROP: Record<TrackProperty, string> = {
  position: '位置',
  rotation: '旋转',
  scale: '缩放',
  opacity: '透明度',
  radius: '范围',
  clusters: '簇',
  size: '尺寸'
}

const rows = computed(() => {
  const order = S.doc.objects.map((o) => o.id)
  return S.doc.tracks
    .filter((t) => t.keys.length)
    .slice()
    .sort((a, b) => order.indexOf(a.targetId) - order.indexOf(b.targetId))
    .map((t) => {
      const obj = S.doc.objects.find((o) => o.id === t.targetId)
      return {
        id: t.id,
        targetId: t.targetId,
        objName: obj?.name || '（已删除）',
        propName: PROP[t.property],
        keys: t.keys
      }
    })
})

const ticks = computed(() => {
  const d = S.doc.duration
  const step = d <= 1 ? 0.1 : d <= 2.5 ? 0.25 : d <= 6 ? 0.5 : 1
  const out: Array<{ t: number; pct: number; label: string }> = []
  const count = Math.floor(d / step)
  for (let i = 0; i <= count; i++) {
    const t = i * step
    out.push({ t, pct: (t / d) * 100, label: step < 1 ? t.toFixed(1) : t.toFixed(0) })
  }
  return out
})

function timeFromEvent(e: PointerEvent | MouseEvent) {
  const rect = area.value!.getBoundingClientRect()
  const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left))
  return (x / rect.width) * S.doc.duration
}

function onAreaDown(e: PointerEvent) {
  if ((e.target as HTMLElement).classList.contains('key')) return
  S.playing = false
  A.clearKeySel()
  A.setTime(timeFromEvent(e))
  const move = (ev: PointerEvent) => {
    A.setTime(timeFromEvent(ev))
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function startKeyDrag(trackId: string, index: number, e: PointerEvent, key: Keyframe) {
  e.preventDefault()
  const tr = S.doc.tracks.find((t) => t.id === trackId)
  if (!tr) return
  A.selectKey(trackId, key, e.shiftKey)
  pushHistory()
  dragKey.value = trackId + ':' + index
  S.playing = false
  A.setTime(tr.keys[index].t)
  const move = (ev: PointerEvent) => {
    const t = Math.max(0, Math.min(S.doc.duration, timeFromEvent(ev)))
    A.moveKey(trackId, index, Number(t.toFixed(3)))
    A.setTime(t)
  }
  const up = () => {
    dragKey.value = ''
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function addAllKeys() {
  if (!S.selectedId) return
  pushHistory()
  A.addKeyframe('position')
  A.addKeyframe('rotation')
  A.addKeyframe('scale')
  const obj = A.selected
  if (obj && obj.kind === 'particles') {
    A.addKeyframe('radius')
    A.addKeyframe('clusters')
    A.addKeyframe('size')
  }
}

function removeTrack(id: string) {
  pushHistory()
  S.doc.tracks = S.doc.tracks.filter((t) => t.id !== id)
  S.version++
}

function toggleLoop() {
  pushHistory()
  S.doc.loop = !S.doc.loop
}
</script>

<style scoped>
.timeline {
  border-top: 1px solid var(--line);
  background: #0d0f17;
}
.tl-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--line-soft);
  flex: none;
}
.play {
  width: 32px;
  height: 26px;
  display: grid;
  place-items: center;
  font-size: 11px;
  background: var(--accent-soft);
  border-color: rgba(255, 138, 61, 0.35);
  color: var(--accent);
  padding: 0;
}
.clock {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-variant-numeric: tabular-nums;
  padding: 0 4px;
}
.clock .cur {
  color: #f0f3fb;
  font-size: 13px;
  font-weight: 600;
}
.clock .tot {
  color: var(--dim-2);
  font-size: 10.5px;
}
.spacer {
  flex: 1;
}
.tl-hint {
  white-space: nowrap;
}
.mini {
  padding: 4px 9px;
  font-size: 11px;
}
.tl-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 172px minmax(0, 1fr);
  overflow: hidden;
}
.tl-labels {
  border-right: 1px solid var(--line-soft);
  overflow-y: auto;
  background: #0b0d14;
}
.lbl-head {
  height: 22px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  color: var(--dim-2);
  font-size: 10px;
  letter-spacing: 0.08em;
  border-bottom: 1px solid var(--line-soft);
}
.lbl {
  height: 24px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px 0 10px;
  border-bottom: 1px solid #12151f;
  cursor: pointer;
}
.lbl.sel {
  background: rgba(255, 138, 61, 0.07);
}
.lbl .nm {
  font-size: 11px;
  color: #c4ccdf;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 92px;
}
.lbl .pr {
  font-size: 10px;
  color: var(--dim-2);
  flex: 1;
  white-space: nowrap;
}
.lbl .del {
  background: transparent;
  border: none;
  color: #4b5468;
  padding: 0 4px;
  font-size: 12px;
  visibility: hidden;
}
.lbl:hover .del {
  visibility: visible;
}
.lbl .del:hover {
  color: var(--red);
  background: transparent;
}
.lbl.empty {
  color: var(--dim-2);
  font-size: 11px;
  cursor: default;
  padding-left: 12px;
}
.tl-area {
  position: relative;
  overflow: hidden;
  background:
    repeating-linear-gradient(90deg, transparent 0, transparent 49px, #10131c 49px, #10131c 50px),
    #0a0c12;
  touch-action: none;
}
.ruler {
  height: 22px;
  border-bottom: 1px solid var(--line-soft);
  position: relative;
  cursor: pointer;
}
.tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #1d2231;
}
.tl-label {
  position: absolute;
  left: 3px;
  top: 3px;
  font-size: 9.5px;
  color: #525b70;
  font-variant-numeric: tabular-nums;
}
.lane {
  height: 24px;
  border-bottom: 1px solid #12151f;
  position: relative;
}
.lane.sel {
  background: rgba(255, 138, 61, 0.04);
}
.key {
  position: absolute;
  top: 50%;
  width: 9px;
  height: 9px;
  margin-left: -4.5px;
  margin-top: -4.5px;
  transform: rotate(45deg);
  background: var(--accent);
  border-radius: 2px;
  box-shadow: 0 0 6px rgba(255, 138, 61, 0.55);
  cursor: grab;
}
.key:hover,
.key.drag {
  background: #ffd2a8;
  box-shadow: 0 0 10px rgba(255, 170, 90, 0.9);
}
.key.sel {
  background: var(--cyan);
  box-shadow: 0 0 0 1px rgba(94, 200, 255, 0.55), 0 0 12px rgba(94, 200, 255, 0.85);
}
.key.sel.cmp {
  background: #c9f0ff;
  box-shadow: 0 0 0 1px rgba(94, 200, 255, 0.9), 0 0 16px rgba(94, 200, 255, 1);
}
.cmp {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 5px;
  border: 1px solid rgba(94, 200, 255, 0.35);
  background: rgba(94, 200, 255, 0.08);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}
.cmp .cmp-l {
  color: #bfe8ff;
}
.cmp .cmp-m {
  color: var(--cyan);
  font-size: 10px;
}
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--cyan);
  box-shadow: 0 0 10px rgba(94, 200, 255, 0.6);
  pointer-events: none;
}
.playhead::before {
  content: '';
  position: absolute;
  top: 0;
  left: -3px;
  width: 7px;
  height: 7px;
  background: var(--cyan);
  clip-path: polygon(0 0, 100% 0, 50% 100%);
}
</style>
