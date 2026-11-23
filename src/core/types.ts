// FastVFX 数据模型：浏览器与 Godot 共用同一套语义
export type Vec3 = [number, number, number]

export interface CurvePoint {
  t: number // 0..1
  v: number
}

export interface Curve {
  points: CurvePoint[]
}

export interface ColorStop {
  t: number // 0..1
  color: string // #rrggbb
  a?: number // 0..1，生命内透明度（缺省 1）
}

export interface Gradient {
  stops: ColorStop[]
}

export interface Transform {
  position: Vec3
  rotation: Vec3 // 欧拉角，单位度，XYZ 顺序
  scale: Vec3
}

export type BlendMode = 'additive' | 'alpha' | 'multiply'
export type ShapeKind = 'point' | 'sphere' | 'box' | 'cone' | 'circle' | 'ring'

export interface EmissionSettings {
  rate: number // 每秒发射数
  duration: number // 0 = 持续
  loop: boolean
  burst: boolean
  burstCount: number
  burstInterval: number
  lifetimeMin: number
  lifetimeMax: number
  shape: ShapeKind
  radius: number
  size: Vec3 // box 尺寸
  coneAngle: number
  surface: boolean // 只在球面/表面发射
}

export interface MotionSettings {
  speedMin: number
  speedMax: number
  direction: Vec3
  spread: number // 度
  gravity: Vec3
  damping: number
  turbulence: number
  turbulenceScale: number
  radial: number // 沿形状法线向外的附加速度
  swirl: number // 绕 Y 轴旋转速度
}

export interface SpinSettings {
  angleMin: number
  angleMax: number
  speedMin: number
  speedMax: number
  align: number // 0..1 朝向速度方向
  stretch: number // 沿速度方向拉长倍率
}

/** 子发射：本发射器的粒子消亡 / 触地时，向另一个发射器注入粒子 */
export interface SubEmitSettings {
  enabled: boolean
  targetId: string // 目标粒子对象 id
  trigger: 'death' | 'ground' // 寿命结束 / 触地
  count: number // 每次触发注入的粒子数
  inherit: number // 0..1，继承父粒子的速度比例
  spread: number // 度，注入方向的随机扩散
}

export interface ParticleRenderSettings {
  textureId: string
  blend: BlendMode
  maxCount: number
  opacity: number
  fadeIn: number // 生命周期占比
  fadeOut: number
  /** billboard = 面向相机的贴片；mesh = 实例化实体几何（碎石/方块/晶体） */
  mode?: 'billboard' | 'mesh'
  meshGeo?: MeshParticleGeo
  /** 序列帧：贴图按 cols×rows 网格等分，随生命进度播放 */
  flipbook?: FlipbookSettings
}

export type MeshParticleGeo = 'shard' | 'box' | 'crystal' | 'rock'

export interface FlipbookSettings {
  enabled: boolean
  cols: number
  rows: number
  /** 播完后保持末帧（true）还是按每帧保持时间循环（false 时按 fps 循环） */
  holdLast: boolean
  fps: number // holdLast=false 时的播放速度
}

export interface CollisionSettings {
  enabled: boolean
  /** 碰撞面高度（世界 y） */
  floor: number
  /** 法向速度反弹系数 0..1 */
  bounce: number
  /** 切向速度保留（1 = 无摩擦） */
  friction: number
  /** 撞地直接消亡，而不是反弹 */
  kill: boolean
}

export interface ParticleDoc {
  id: string
  kind: 'particles'
  name: string
  visible: boolean
  transform: Transform
  emission: EmissionSettings
  motion: MotionSettings
  sizeBase: number
  /** 簇数量：一次喷射拆成几个火头，1 = 单簇 */
  clusters: number
  /** 簇散布半径（米） */
  clusterRadius: number
  sizeCurve: Curve
  /** 生命内速度倍率曲线（1 = 原速） */
  speedCurve: Curve
  /** 生命内自旋倍率曲线（1 = 原角速度） */
  spinCurve: Curve
  gradient: Gradient
  brightness: number
  spin: SpinSettings
  render: ParticleRenderSettings
  collide: CollisionSettings
  sub: SubEmitSettings
}

export type GeoKind =
  | 'box'
  | 'sphere'
  | 'icosahedron'
  | 'torus'
  | 'torusKnot'
  | 'cone'
  | 'cylinder'
  | 'capsule'
  | 'plane'
  | 'ring'
  | 'disc'
  | 'arc'
  | 'crystal'
  | 'rock'
  | 'imported' // 上传的 GLB/GLTF 资产

export interface GeoParams {
  size: number
  radius: number
  tube: number
  segments: number
  rings: number
  thickness: number
  angle: number // deg，arc 用
  detail: number
  deform: number
  seed: number
  variant?: number // 0 = 原始形状，1..8 = 变种
}

export interface ModelMaterial {
  color: string
  emissive: string
  emissiveIntensity: number
  metalness: number
  roughness: number
  opacity: number
  wireframe: boolean
  textureId: string
  uvRepeat: number
  flatShading: boolean
  blend: 'opaque' | 'additive' | 'alpha'
}

export interface ModelDoc {
  id: string
  kind: 'model'
  name: string
  visible: boolean
  transform: Transform
  geometry: GeoKind
  params: GeoParams
  material: ModelMaterial
  assetId?: string // geometry === 'imported' 时引用 doc.modelAssets
}

/** 上传的 GLB/GLTF 模型资产（分类后可复用） */
export interface ModelAsset {
  id: string
  name: string
  category: string
  sizeKB: number
  tris?: number
  file?: string // data/models 下的文件名
  url?: string // /data/models/<file>，项目内落盘的正式来源
  dataUrl?: string // 临时/兜底：base64，只在没有落盘能力时用，IndexedDB 暂存
}

export type FXObject = ParticleDoc | ModelDoc

export type TrackProperty = 'position' | 'rotation' | 'scale' | 'opacity' | 'radius' | 'clusters' | 'size'

export interface Keyframe {
  t: number
  v: number | Vec3
}

export interface Track {
  id: string
  targetId: string
  property: TrackProperty
  keys: Keyframe[]
  smooth: boolean
}

export interface TextureAsset {
  id: string
  name: string
  gen: string // 程序化生成器 id，空则为上传图
  dataUrl?: string
  params: { seed: number; contrast: number; softness: number; variant?: number }
}

export interface EffectDoc {
  version: 1
  name: string
  duration: number
  loop: boolean
  bg: string
  grid: boolean
  bloom: boolean
  bloomStrength: number
  camera: { position: Vec3; target: Vec3; fov: number }
  objects: FXObject[]
  tracks: Track[]
  textures: TextureAsset[]
  modelAssets?: ModelAsset[]
}

let seq = 0
export function uid(prefix = 'o'): string {
  seq += 1
  return `${prefix}${Date.now().toString(36).slice(-4)}${seq.toString(36)}`
}

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z]
}

export function defaultTransform(): Transform {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
}

export function defaultParams(kind: GeoKind): GeoParams {
  const base: GeoParams = {
    size: 1,
    radius: 0.5,
    tube: 0.18,
    segments: 32,
    rings: 16,
    thickness: 0.4,
    angle: 360,
    detail: 1,
    deform: 0,
    seed: 1,
    variant: 0
  }
  switch (kind) {
    case 'torus':
      return { ...base, radius: 0.8, tube: 0.25, segments: 64, rings: 20 }
    case 'torusKnot':
      return { ...base, radius: 0.7, tube: 0.16, segments: 128, rings: 16 }
    case 'ring':
      return { ...base, radius: 0.8, thickness: 0.25, segments: 64 }
    case 'disc':
      return { ...base, radius: 0.8, segments: 48 }
    case 'arc':
      return { ...base, radius: 1.1, thickness: 0.06, segments: 64, angle: 150 }
    case 'crystal':
      return { ...base, radius: 0.6, detail: 1, deform: 0.28 }
    case 'rock':
      return { ...base, radius: 0.6, detail: 2, deform: 0.35 }
    case 'plane':
      return { ...base, size: 2 }
    default:
      return base
  }
}
