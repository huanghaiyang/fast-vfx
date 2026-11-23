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

export interface ParticleRenderSettings {
  textureId: string
  blend: BlendMode
  maxCount: number
  opacity: number
  fadeIn: number // 生命周期占比
  fadeOut: number
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
  gradient: Gradient
  brightness: number
  spin: SpinSettings
  render: ParticleRenderSettings
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
