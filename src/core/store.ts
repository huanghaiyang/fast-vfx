import { reactive, watch } from 'vue'
import type { EffectDoc, FXObject, Keyframe, Track, TrackProperty, Vec3 } from './types'
import { BASE_TEXTURES, cloneDoc, createImportedModel, createModel, createParticle, emptyDoc, mergeTrack } from './doc'
import { PRESETS } from './presets'
import { sampleTrack } from './curve'
import type { FXEngine, GizmoMode } from './engine'
import type { GeoKind, ModelAsset } from './types'
import { deleteModelData, getModelData, putModelData } from './assetStore'
import { deleteServerModel, listServerModels } from './assets'

export const S = reactive({
  doc: PRESETS[0].build() as EffectDoc,
  selectedId: null as string | null,
  /** 时间轴上被选中的关键帧（最多两个，选两个即进入对比） */
  keySel: [] as Keyframe[],
  /** 视口里是否画出位移轨道的轨迹线 */
  showPaths: true,
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
  S.keySel = []
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
    S.keySel = []
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
    S.keySel = []
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
    const key = tr.keys[index]
    if (key) S.keySel = S.keySel.filter((k) => k !== key)
    tr.keys.splice(index, 1)
    if (!tr.keys.length) S.doc.tracks = S.doc.tracks.filter((t) => t.id !== trackId)
    S.version++
  },

  /* --------------------------- 关键帧选择 / 编辑 --------------------------- */
  selectKey(trackId: string, key: Keyframe, additive = false) {
    const tr = S.doc.tracks.find((t) => t.id === trackId)
    if (!tr) return
    if (!additive) {
      S.keySel = [key]
    } else {
      const i = S.keySel.indexOf(key)
      if (i >= 0) S.keySel.splice(i, 1)
      else if (S.keySel.length === 0) S.keySel = [key]
      else {
        const curTrackId = trackOfKey(S.keySel[0])?.id
        if (curTrackId !== tr.id) S.keySel = [key] // 换了轨道就从单帧重新开始
        else {
          S.keySel.push(key)
          if (S.keySel.length > 2) S.keySel.shift()
        }
      }
    }
    S.selectedId = tr.targetId
    S.playing = false
    S.time = key.t
    S.version++
  },

  clearKeySel() {
    S.keySel = []
  },

  setKeyTime(trackId: string, key: Keyframe, t: number) {
    const tr = S.doc.tracks.find((x) => x.id === trackId)
    if (!tr) return
    pushHistory()
    key.t = Math.max(0, Math.min(S.doc.duration, t))
    tr.keys.sort((a, b) => a.t - b.t)
    S.version++
  },

  setKeyValue(key: Keyframe, v: number | Vec3) {
    pushHistory()
    key.v = v
    S.version++
  },

  setTrackSmooth(trackId: string, smooth: boolean) {
    const tr = S.doc.tracks.find((x) => x.id === trackId)
    if (!tr) return
    pushHistory()
    tr.smooth = smooth
    S.version++
  },

  /**
   * 该参数已有轨道时，面板上改值直接写到当前播放头位置的关键帧上，
   * 否则改动会被轨道覆盖、看起来「调了没反应」。
   */
  writeTrackValue(property: TrackProperty, targetId: string, v: number | Vec3) {
    const existing = S.doc.tracks.find((t) => t.targetId === targetId && t.property === property)
    if (!existing || !existing.keys.length) return false
    mergeTrack(S.doc.tracks, targetId, property, Number(S.time.toFixed(3)), v)
    S.version++
    return true
  },

  /** 读取某对象某属性在某个时间点的生效值（考虑轨道覆盖） */
  valueAtTime(targetId: string, property: TrackProperty, t: number): number | Vec3 | null {
    const obj = S.doc.objects.find((o) => o.id === targetId)
    if (!obj) return null
    const tr = S.doc.tracks.find((x) => x.targetId === targetId && x.property === property)
    if (tr && tr.keys.length) return sampleTrack(tr, t)
    return readProperty(obj, property)
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

/** 找到某个关键帧所在的轨道 */
export function trackOfKey(key: Keyframe): Track | null {
  for (const t of S.doc.tracks) if (t.keys.includes(key)) return t
  return null
}

export function keyIndexOf(track: Track, key: Keyframe): number {
  return track.keys.indexOf(key)
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

/* ------------------------------ 上传模型资产 ------------------------------ */
export const MODEL_CATEGORIES = ['岩石', '植被', '建筑', '道具', '角色', '特效件', '其他'] as const

/** 按文件名猜分类，猜不中归到「其他」，用户可随时改 */
export function guessCategory(name: string): string {
  const n = name.toLowerCase()
  const rules: Array<[string, string[]]> = [
    ['岩石', ['rock', 'stone', 'boulder', 'cliff', 'crag', '碎石', '岩']],
    ['植被', ['tree', 'plant', 'grass', 'bush', 'leaf', 'flower', '植被', '树', '草', '花']],
    ['建筑', ['building', 'house', 'wall', 'tower', 'pillar', 'column', 'gate', '建筑', '楼', '塔', '墙', '柱']],
    ['道具', ['sword', 'weapon', 'box', 'crate', 'barrel', 'chest', 'item', 'prop', '剑', '箱', '桶', '道具']],
    ['角色', ['character', 'char', 'hero', 'monster', 'creature', 'zombie', 'beast', '角色', '怪', '人']],
    ['特效件', ['fx', 'vfx', 'effect', 'magic', 'crystal', 'shard', 'orb', '特效', '晶']]
  ]
  for (const [cat, keys] of rules) if (keys.some((k) => n.includes(k))) return cat
  return '其他'
}

export function addModelAsset(asset: ModelAsset) {
  pushHistory()
  if (!S.doc.modelAssets) S.doc.modelAssets = []
  S.doc.modelAssets.push(asset)
  if (asset.dataUrl) void putModelData(asset.id, asset.dataUrl)
  S.version++
}

export function setModelCategory(assetId: string, category: string) {
  const a = (S.doc.modelAssets || []).find((x) => x.id === assetId)
  if (!a) return
  pushHistory()
  a.category = category
  S.version++
}

export function addImportedModel(assetId: string) {
  const asset = (S.doc.modelAssets || []).find((a) => a.id === assetId)
  if (!asset) return toast('模型资产不存在', 'warn')
  pushHistory()
  const m = createImportedModel(asset)
  S.doc.objects.push(m)
  S.selectedId = m.id
  S.version++
  engineRef?.sync()
  toast(`已添加「${asset.name}」`, 'ok')
}

export function removeModelAsset(assetId: string) {
  const used = S.doc.objects.some((o) => o.kind === 'model' && o.assetId === assetId)
  if (used) {
    toast('该模型仍有实例在场景里，先删除实例', 'warn')
    return
  }
  const asset = (S.doc.modelAssets || []).find((a) => a.id === assetId)
  pushHistory()
  S.doc.modelAssets = (S.doc.modelAssets || []).filter((a) => a.id !== assetId)
  if (asset?.file) void deleteServerModel(asset.file)
  void deleteModelData(assetId)
  S.version++
}

/** 扫描项目 data/models，把还没入册的 glb 补进模型库（也会读到用户手工放进目录的文件） */
export async function refreshModelLibrary(): Promise<number> {
  const files = await listServerModels()
  if (!files.length) return 0
  if (!S.doc.modelAssets) S.doc.modelAssets = []
  let added = 0
  for (const f of files) {
    const exist = S.doc.modelAssets.find((a) => a.file === f.file || a.url === f.url)
    if (exist) {
      if (exist.sizeKB !== f.sizeKB || exist.file !== f.file) {
        exist.file = f.file
        exist.url = f.url
        exist.sizeKB = f.sizeKB
      }
      continue
    }
    S.doc.modelAssets.push({
      id: 'fa_' + f.file.replace(/[^\w\u4e00-\u9fa5]/g, '_'),
      name: f.file.replace(/\.(glb|gltf)$/i, ''),
      category: guessCategory(f.file),
      sizeKB: f.sizeKB,
      file: f.file,
      url: f.url
    })
    added++
  }
  if (added) S.version++
  return added
}

/** 没有落盘的旧数据：从 IndexedDB 补回临时二进制 */
export async function hydrateModelAssets() {
  const list = S.doc.modelAssets || []
  let changed = false
  for (const a of list) {
    if (a.url) continue
    if (a.dataUrl) {
      void putModelData(a.id, a.dataUrl)
      continue
    }
    const data = await getModelData(a.id)
    if (data) {
      a.dataUrl = data
      changed = true
    }
  }
  if (changed) {
    S.version++
    engineRef?.sync()
  }
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
    if (!doc.modelAssets) doc.modelAssets = []
    S.doc = doc
    S.selectedId = null
    S.keySel = []
    S.time = 0
    S.version++
    engineRef?.sync()
    void hydrateModelAssets()
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
        // 模型二进制不入 localStorage：落盘在 data/models，或临时存 IndexedDB
        const plain = JSON.parse(JSON.stringify(S.doc)) as EffectDoc
        if (plain.modelAssets) plain.modelAssets = plain.modelAssets.map((a) => ({ ...a, dataUrl: undefined }))
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(plain))
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
    if (!doc.modelAssets) doc.modelAssets = []
    S.doc = doc
    S.time = 0
    S.version++
    void hydrateModelAssets()
    return true
  } catch {
    return false
  }
}

export function clearAutosave() {
  localStorage.removeItem(AUTOSAVE_KEY)
}
