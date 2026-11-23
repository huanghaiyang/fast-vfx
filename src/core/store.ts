import { reactive, watch } from 'vue'
import type { EffectDoc, FXObject, TrackProperty, Vec3 } from './types'
import { BASE_TEXTURES, cloneDoc, createModel, createParticle, emptyDoc, mergeTrack } from './doc'
import { PRESETS } from './presets'
import type { FXEngine, GizmoMode } from './engine'
import type { GeoKind } from './types'

export const S = reactive({
  doc: PRESETS[0].build() as EffectDoc,
  selectedId: null as string | null,
  time: 0,
  playing: true,
  mode: 'translate' as GizmoMode,
  autoKey: false,
  fps: 0,
  tab: 'preset' as 'preset' | 'model' | 'texture',
  toast: '',
  toastKind: 'info' as 'info' | 'ok' | 'warn',
  busy: false,
  helpOpen: false,
  version: 0,
  leftOpen: true,
  rightOpen: true
})

let engineRef: FXEngine | null = null
export function registerEngine(e: FXEngine | null) {
  engineRef = e
  ;(globalThis as any).__fastvfx_engine = e
}

export function captureCameraQuiet() {
  engineRef?.captureCamera()
}

export function toast(msg: string, kind: 'info' | 'ok' | 'warn' = 'info') {
  S.toast = msg
  S.toastKind = kind
  window.clearTimeout((toast as any)._t)
  ;(toast as any)._t = window.setTimeout(() => (S.toast = ''), 2600)
}

/* -------------------------------- 历史 -------------------------------- */
const undoStack: string[] = []
const redoStack: string[] = []
const MAX_HISTORY = 40

export function pushHistory() {
  const snap = JSON.stringify(S.doc)
  if (undoStack[undoStack.length - 1] === snap) return
  undoStack.push(snap)
  if (undoStack.length > MAX_HISTORY) undoStack.shift()
  redoStack.length = 0
}

function restore(snap: string) {
  S.doc = JSON.parse(snap) as EffectDoc
  if (S.selectedId && !S.doc.objects.some((o) => o.id === S.selectedId)) S.selectedId = null
  S.time = Math.min(S.time, S.doc.duration)
  S.version++
}

export function undo() {
  if (!undoStack.length) return toast('没有可撤销的操作')
  redoStack.push(JSON.stringify(S.doc))
  restore(undoStack.pop()!)
  toast('已撤销', 'info')
}

export function redo() {
  if (!redoStack.length) return toast('没有可重做的操作')
  undoStack.push(JSON.stringify(S.doc))
  restore(redoStack.pop()!)
  toast('已重做', 'info')
}

/* -------------------------------- 对象 -------------------------------- */
export const A = {
  select(id: string | null) {
    S.selectedId = id
  },

  get selected(): FXObject | null {
    return S.doc.objects.find((o) => o.id === S.selectedId) || null
  },

  addModel(kind: GeoKind) {
    pushHistory()
    const obj = createModel(kind)
    obj.name = `${obj.name} ${S.doc.objects.filter((o) => o.kind === 'model').length + 1}`
    obj.transform.position = [0, 0.6, 0]
    S.doc.objects.push(obj)
    S.selectedId = obj.id
    S.version++
    engineRef?.sync()
  },

  addParticle() {
    pushHistory()
    const obj = createParticle({ name: `发射器 ${S.doc.objects.filter((o) => o.kind === 'particles').length + 1}` })
    obj.transform.position = [0, 1, 0]
    obj.render.textureId = S.doc.textures[0]?.id || ''
    S.doc.objects.push(obj)
    S.selectedId = obj.id
    S.version++
    engineRef?.sync()
  },

  remove(id = S.selectedId) {
    if (!id) return
    pushHistory()
    S.doc.objects = S.doc.objects.filter((o) => o.id !== id)
    S.doc.tracks = S.doc.tracks.filter((t) => t.targetId !== id)
    if (S.selectedId === id) S.selectedId = null
    S.version++
    engineRef?.sync()
  },

  duplicate(id = S.selectedId) {
    if (!id) return
    const src = S.doc.objects.find((o) => o.id === id)
    if (!src) return
    pushHistory()
    const copy = cloneDoc(S.doc).objects.find((o) => o.id === id)!
    copy.id = Math.random().toString(36).slice(2, 9)
    copy.name = `${src.name} 副本`
    copy.transform.position = [src.transform.position[0] + 0.6, src.transform.position[1], src.transform.position[2]]
    S.doc.objects.push(copy)
    S.selectedId = copy.id
    S.version++
    engineRef?.sync()
  },

  setPreset(id: string) {
    const preset = PRESETS.find((p) => p.id === id)
    if (!preset) return
    if (S.doc.objects.length) pushHistory()
    const doc = preset.build()
    doc.textures = mergeTextures(doc)
    S.doc = doc
    S.selectedId = null
    S.time = 0
    S.playing = true
    S.version++
    engineRef?.sync()
    toast(`已载入预设：${preset.name}`, 'ok')
  },

  newDoc() {
    if (S.doc.objects.length) pushHistory()
    const doc = emptyDoc('新特效')
    doc.objects.push(createModel('plane', { name: '地面', transform: { position: [0, 0, 0], rotation: [-90, 0, 0], scale: [1, 1, 1] } }))
    S.doc = doc
    S.selectedId = null
    S.time = 0
    S.version++
    engineRef?.sync()
  },

  setTime(t: number) {
    S.time = Math.max(0, Math.min(S.doc.duration, t))
    S.playing = false
  },

  togglePlay() {
    if (!S.playing && S.time >= S.doc.duration) S.time = 0
    S.playing = !S.playing
  },

  addKeyframe(property: TrackProperty, targetId = S.selectedId) {
    if (!targetId) return
    const obj = S.doc.objects.find((o) => o.id === targetId)
    if (!obj) return
    pushHistory()
    const value = readProperty(obj, property)
    if (value === null) {
      toast('该对象没有这个参数', 'warn')
      return
    }
    const existing = S.doc.tracks.find((t) => t.targetId === targetId && t.property === property)
    if (!existing) S.doc.tracks.push({ id: `tr${Date.now()}`, targetId, property, keys: [], smooth: true })
    mergeTrack(S.doc.tracks, targetId, property, Number(S.time.toFixed(3)), value)
    S.version++
    toast('已添加关键帧', 'ok')
  },

  autoKeyTransform(id: string, properties: TrackProperty[] = ['position', 'rotation', 'scale']) {
    if (!S.autoKey) return
    const obj = S.doc.objects.find((o) => o.id === id)
    if (!obj) return
    for (const p of properties) {
      const v =
        p === 'position'
          ? ([...obj.transform.position] as Vec3)
          : p === 'rotation'
            ? ([...obj.transform.rotation] as Vec3)
            : ([...obj.transform.scale] as Vec3)
      mergeTrack(S.doc.tracks, id, p, Number(S.time.toFixed(3)), v)
    }
  },

  removeKey(trackId: string, index: number) {
    pushHistory()
    const tr = S.doc.tracks.find((t) => t.id === trackId)
    if (!tr) return
    tr.keys.splice(index, 1)
    if (!tr.keys.length) S.doc.tracks = S.doc.tracks.filter((t) => t.id !== trackId)
    S.version++
  },

  moveKey(trackId: string, index: number, t: number) {
    const tr = S.doc.tracks.find((x) => x.id === trackId)
    if (!tr) return
    tr.keys[index].t = Math.max(0, Math.min(S.doc.duration, t))
    tr.keys.sort((a, b) => a.t - b.t)
    S.version++
  },

  /** 在时间轴上写入当前属性值（用于拖拽结束） */
  writeKey(trackId: string, index: number) {
    const tr = S.doc.tracks.find((x) => x.id === trackId)
    const obj = tr ? S.doc.objects.find((o) => o.id === tr.targetId) : null
    if (!tr || !obj) return
    const key = tr.keys[index]
    if (!key) return
    const v = readProperty(obj, tr.property)
    if (v !== null) key.v = v
    S.version++
  },

  captureCamera() {
    engineRef?.captureCamera()
    engineRef?.sync()
    toast('机位已记录', 'ok')
  },

  resetCamera() {
    const cam = S.doc.camera
    cam.position = [0, 2.2, 6]
    cam.target = [0, 1, 0]
    engineRef?.applyCamera(true)
    S.version++
  }
}

/** 读取轨道对应的当前值；粒子参数走专属字段 */
function readProperty(obj: FXObject, property: TrackProperty): number | Vec3 | null {
  if (property === 'position') return [...obj.transform.position] as Vec3
  if (property === 'rotation') return [...obj.transform.rotation] as Vec3
  if (property === 'scale') return [...obj.transform.scale] as Vec3
  if (property === 'opacity') return obj.kind === 'particles' ? obj.render.opacity : obj.material.opacity
  if (obj.kind !== 'particles') return null
  if (property === 'radius') return obj.emission.radius
  if (property === 'clusters') return obj.clusters
  if (property === 'size') return obj.sizeBase
  return null
}

function mergeTextures(doc: EffectDoc): EffectDoc['textures'] {  const ids = new Set(doc.textures.map((t) => t.id))
  const out = doc.textures.map((t) => {
    const base = BASE_TEXTURES.find((b) => b.id === t.id)
    return base ? { ...base, ...t } : t
  })
  for (const b of BASE_TEXTURES) if (!ids.has(b.id)) out.push({ ...b })
  return out
}

export function addTexture(asset: EffectDoc['textures'][number]) {
  pushHistory()
  S.doc.textures.push(asset)
  S.version++
}

export function selectTexture(id: string) {
  const obj = A.selected
  if (!obj) return toast('先选中一个对象', 'warn')
  pushHistory()
  if (obj.kind === 'particles') obj.render.textureId = id
  else obj.material.textureId = id
  S.version++
  engineRef?.sync()
}

/* -------------------------------- 文件 -------------------------------- */
export function serialize(): string {
  const doc = cloneDoc(S.doc)
  return JSON.stringify(doc, null, 2)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function saveProject() {
  engineRef?.captureCamera()
  downloadBlob(new Blob([serialize()], { type: 'application/json' }), `${S.doc.name || 'effect'}.vfx.json`)
  toast('已导出项目文件', 'ok')
}

export async function importProject(file: File) {
  const text = await file.text()
  try {
    const doc = JSON.parse(text) as EffectDoc
    if (!Array.isArray(doc.objects)) throw new Error('格式不正确')
    pushHistory()
    doc.textures = mergeTextures(doc)
    S.doc = doc
    S.selectedId = null
    S.time = 0
    S.version++
    engineRef?.sync()
    toast('项目已载入', 'ok')
  } catch (err) {
    toast('文件解析失败：' + (err as Error).message, 'warn')
  }
}

/* -------------------------------- 自动保存 -------------------------------- */
const AUTOSAVE_KEY = 'fastvfx:autosave:v1'
let autosaveTimer = 0
watch(
  () => S.doc,
  () => {
    window.clearTimeout(autosaveTimer)
    autosaveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(S.doc))
      } catch {
        /* 忽略配额错误 */
      }
    }, 900)
  },
  { deep: true }
)

export function restoreAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return false
    const doc = JSON.parse(raw) as EffectDoc
    if (!Array.isArray(doc.objects) || !doc.objects.length) return false
    doc.textures = mergeTextures(doc)
    S.doc = doc
    S.time = 0
    S.version++
    return true
  } catch {
    return false
  }
}

export function clearAutosave() {
  localStorage.removeItem(AUTOSAVE_KEY)
}
