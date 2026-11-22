import type {
  Curve,
  EffectDoc,
  GeoKind,
  Gradient,
  ModelDoc,
  ParticleDoc,
  TextureAsset,
  Track,
  Vec3
} from './types'
import { defaultParams, defaultTransform, uid } from './types'

export function c(points: Array<[number, number]>): Curve {
  return { points: points.map(([t, v]) => ({ t, v })) }
}

export function grad(stops: Array<[number, string]>): Gradient {
  return { stops: stops.map(([t, color]) => ({ t, color })) }
}

export function tex(
  id: string,
  name: string,
  gen: string,
  params: Partial<TextureAsset['params']> = {}
): TextureAsset {
  return { id, name, gen, params: { seed: 1, contrast: 1, softness: 0.5, ...params } }
}

export function createParticle(overrides: DeepPartial<ParticleDoc> = {}): ParticleDoc {
  const doc: ParticleDoc = {
    id: uid('p'),
    kind: 'particles',
    name: '粒子发射器',
    visible: true,
    transform: defaultTransform(),
    emission: {
      rate: 180,
      duration: 0,
      loop: true,
      burst: false,
      burstCount: 200,
      burstInterval: 1.2,
      lifetimeMin: 0.7,
      lifetimeMax: 1.3,
      shape: 'cone',
      radius: 0.25,
      size: [1, 0.2, 1],
      coneAngle: 14,
      surface: false
    },
    motion: {
      speedMin: 0.8,
      speedMax: 1.8,
      direction: [0, 1, 0],
      spread: 18,
      gravity: [0, 0, 0],
      damping: 0.4,
      turbulence: 0,
      turbulenceScale: 1.2,
      radial: 0,
      swirl: 0
    },
    sizeBase: 0.4,
    sizeCurve: c([
      [0, 0.35],
      [0.25, 1],
      [1, 0.6]
    ]),
    gradient: grad([
      [0, '#fff2c4'],
      [0.35, '#ffa02c'],
      [0.8, '#ff3b0d'],
      [1, '#2a0a00']
    ]),
    brightness: 1.4,
    spin: { angleMin: 0, angleMax: 360, speedMin: -60, speedMax: 60, align: 0, stretch: 0 },
    render: {
      textureId: 'tex_flame',
      blend: 'additive',
      maxCount: 2000,
      opacity: 1,
      fadeIn: 0.12,
      fadeOut: 0.35
    }
  }
  return merge(doc, overrides) as ParticleDoc
}

export function createModel(kind: GeoKind = 'box', overrides: DeepPartial<ModelDoc> = {}): ModelDoc {
  const doc: ModelDoc = {
    id: uid('m'),
    kind: 'model',
    name: geoLabel(kind),
    visible: true,
    transform: defaultTransform(),
    geometry: kind,
    params: defaultParams(kind),
    material: {
      color: '#8a93ff',
      emissive: '#3b2bff',
      emissiveIntensity: 1.2,
      metalness: 0.2,
      roughness: 0.35,
      opacity: 1,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'opaque'
    }
  }
  return merge(doc, overrides) as ModelDoc
}

export function geoLabel(kind: GeoKind): string {
  const map: Record<GeoKind, string> = {
    box: '立方体',
    sphere: '球体',
    icosahedron: '多面体',
    torus: '圆环',
    torusKnot: '环面纽结',
    cone: '圆锥',
    cylinder: '圆柱',
    capsule: '胶囊',
    plane: '平面',
    ring: '圆环面片',
    disc: '圆盘',
    arc: '弧形刀光',
    crystal: '晶体',
    rock: '岩石'
  }
  return map[kind] || kind
}

export const BASE_TEXTURES: TextureAsset[] = [
  tex('tex_flame', '火焰', 'flame', { seed: 3 }),
  tex('tex_smoke', '烟雾', 'smoke', { seed: 7, softness: 0.7 }),
  tex('tex_spark', '火花', 'spark', { seed: 5 }),
  tex('tex_star', '星芒', 'star', { seed: 2 }),
  tex('tex_ring', '光环', 'ring'),
  tex('tex_glow', '柔光', 'glow'),
  tex('tex_magic', '法阵', 'magicCircle'),
  tex('tex_noise', '噪波', 'noise', { seed: 9 }),
  tex('tex_shard', '碎片', 'shard'),
  tex('tex_bolt', '电弧', 'bolt', { seed: 11 }),
  tex('tex_dot', '圆点', 'dot'),
  tex('tex_leaf', '叶形', 'leaf')
]

export function emptyDoc(name = '新特效'): EffectDoc {
  return {
    version: 1,
    name,
    duration: 3,
    loop: true,
    bg: '#08090f',
    grid: true,
    bloom: true,
    bloomStrength: 0.55,
    camera: { position: [0, 2.2, 6], target: [0, 1, 0], fov: 45 },
    objects: [],
    tracks: [],
    textures: BASE_TEXTURES.map((t) => ({ ...t }))
  }
}

export function cloneDoc(doc: EffectDoc): EffectDoc {
  return JSON.parse(JSON.stringify(doc)) as EffectDoc
}

export function mergeTrack(tracks: Track[], targetId: string, property: Track['property'], t: number, v: number | Vec3) {
  let track = tracks.find((tr) => tr.targetId === targetId && tr.property === property)
  if (!track) {
    track = { id: uid('tr'), targetId, property, keys: [], smooth: true }
    tracks.push(track)
  }
  const keys = track.keys
  const existing = keys.find((k) => Math.abs(k.t - t) < 0.02)
  if (existing) existing.v = v
  else keys.push({ t, v })
  keys.sort((a, b) => a.t - b.t)
  return track
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> | T[K] : T[K] }

export function merge<T>(base: T, patch: any): T {
  if (!patch) return base
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) }
  for (const k of Object.keys(patch)) {
    const v = patch[k]
    const b = (base as any)[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b)) {
      out[k] = merge(b, v)
    } else {
      out[k] = v
    }
  }
  return out
}
