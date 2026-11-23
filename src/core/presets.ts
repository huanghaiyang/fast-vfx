import type { EffectDoc, ModelDoc, ParticleDoc, Track, TrackProperty, Vec3 } from './types'
import { c, createModel, createParticle, emptyDoc, grad } from './doc'
import { uid } from './types'

function track(targetId: string, property: TrackProperty, keys: Array<[number, number | Vec3]>, smooth = true): Track {
  return { id: uid('tr'), targetId, property, keys: keys.map(([t, v]) => ({ t, v })), smooth }
}

export type PresetTag = '火焰' | '元素' | '战斗' | '法术' | '演示'

/** 地面光晕：所有火焰类特效脚下都要有一层暖光，否则火像悬在黑板上 */
function glowDisc(name: string, radius: number, opacity: number, color = '#ff7a1e', emissive = '#ff3c00', y = 0.02): ModelDoc {
  return createModel('disc', {
    name,
    transform: { position: [0, y, 0], rotation: [-90, 0, 0], scale: [radius, radius, radius] },
    params: { size: 1, radius: 1, tube: 0.2, segments: 48, rings: 8, thickness: 0.3, angle: 360, detail: 1, deform: 0, seed: 1 },
    material: {
      color,
      emissive,
      emissiveIntensity: 0.5,
      metalness: 0,
      roughness: 1,
      opacity,
      wireframe: false,
      textureId: 'tex_glow',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })
}

/** 火焰体：低透明度的烟雾层，给火舌垫出体积，避免只剩几根飘丝 */
function flameBody(name: string, rate: number, size: number, radius = 0.28, opacity = 0.26): ParticleDoc {
  return createParticle({
    name,
    transform: { position: [0, 0.28, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate, shape: 'cone', radius, coneAngle: 16, lifetimeMin: 0.45, lifetimeMax: 0.95, burst: false },
    motion: {
      speedMin: 0.8,
      speedMax: 1.8,
      direction: [0, 1, 0],
      spread: 18,
      gravity: [0, 1.5, 0],
      damping: 1.2,
      turbulence: 0.8,
      turbulenceScale: 1.5,
      swirl: 0.5
    },
    sizeBase: size,
    sizeCurve: c([
      [0, 0.35],
      [0.25, 1],
      [1, 0.7]
    ]),
    gradient: grad([
      [0, '#ffb050'],
      [0.4, '#ff5c10'],
      [0.8, '#8a1400'],
      [1, '#140300']
    ]),
    brightness: 1,
    spin: { angleMin: 0, angleMax: 360, speedMin: -30, speedMax: 30, align: 0, stretch: 0 },
    render: { textureId: 'tex_smoke', blend: 'additive', maxCount: 2600, opacity, fadeIn: 0.15, fadeOut: 0.5 }
  })
}

export interface Preset {
  id: string
  name: string
  desc: string
  tag: PresetTag
  accent: string
  build: () => EffectDoc
}

/* ---------------------------------- 火焰 ---------------------------------- */
function buildFire(): EffectDoc {
  const doc = emptyDoc('烈焰')
  doc.duration = 2.5
  const body = flameBody('火焰体', 150, 0.6, 0.22, 0.16)
  body.clusters = 3
  body.clusterRadius = 0.42
  const fire = createParticle({
    name: '火焰核心',
    transform: { position: [0, 0.35, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: {
      rate: 340,
      shape: 'cone',
      radius: 0.2,
      coneAngle: 17,
      lifetimeMin: 0.5,
      lifetimeMax: 1.0,
      burst: false
    },
    motion: {
      speedMin: 0.9,
      speedMax: 2.0,
      direction: [0, 1, 0],
      spread: 26,
      gravity: [0, 1.4, 0],
      damping: 1.3,
      turbulence: 0.9,
      turbulenceScale: 1.6,
      swirl: 0.6
    },
    sizeBase: 0.4,
    sizeCurve: c([
      [0, 0.3],
      [0.2, 1.0],
      [0.7, 1.25],
      [1, 0.55]
    ]),
    gradient: grad([
      [0, '#ffe6a3'],
      [0.22, '#ffab3a'],
      [0.55, '#f2540c'],
      [0.85, '#a81400'],
      [1, '#1c0400']
    ]),
    brightness: 0.72,
    spin: { angleMin: 0, angleMax: 360, speedMin: -32, speedMax: 32, align: 0.82, stretch: 0.07 },
    render: { textureId: 'tex_flame', blend: 'additive', maxCount: 3000, opacity: 0.3, fadeIn: 0.1, fadeOut: 0.4 }
  })
  fire.clusters = 4
  fire.clusterRadius = 0.34

  const embers = createParticle({
    name: '飞溅火星',
    transform: { position: [0, 0.3, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 45, shape: 'sphere', radius: 0.3, lifetimeMin: 0.9, lifetimeMax: 2.1, burst: false },
    motion: {
      speedMin: 1.6,
      speedMax: 4.2,
      direction: [0, 1, 0],
      spread: 55,
      gravity: [-0.4, 1.2, 0],
      damping: 0.5,
      turbulence: 1.1,
      turbulenceScale: 2.4
    },
    sizeBase: 0.1,
    sizeCurve: c([
      [0, 1],
      [1, 0.15]
    ]),
    gradient: grad([
      [0, '#fffbe8'],
      [0.5, '#ffae2e'],
      [1, '#ff2f00']
    ]),
    brightness: 1.5,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 1, stretch: 0.035 },
    render: { textureId: 'tex_spark', blend: 'additive', maxCount: 900, opacity: 0.75, fadeIn: 0.05, fadeOut: 0.3 }
  })

  const ground = createModel('disc', {
    name: '灰烬地面',
    transform: { position: [0, 0.01, 0], rotation: [-90, 0, 0], scale: [1.6, 1.6, 1.6] },
    params: { size: 1, radius: 1, tube: 0.2, segments: 48, rings: 8, thickness: 0.3, angle: 360, detail: 1, deform: 0, seed: 1 },
    material: {
      color: '#100d0a',
      emissive: '#170f08',
      emissiveIntensity: 0.18,
      metalness: 0,
      roughness: 1,
      opacity: 1,
      wireframe: false,
      textureId: 'tex_noise',
      uvRepeat: 4,
      flatShading: false,
      blend: 'opaque'
    }
  })

  doc.objects = [glowDisc('地面暖光', 2.1, 0.34), body, fire, embers]
  doc.tracks = [
    track(fire.id, 'scale', [
      [0, [1, 1, 1]],
      [1.2, [1.06, 1.14, 1.06]],
      [2.5, [1, 1, 1]]
    ]),
    // 范围 / 簇 / 尺寸 都带关键帧，时间轴上可直接查看与拖动
    track(fire.id, 'radius', [
      [0, 0.16],
      [0.9, 0.34],
      [1.8, 0.2],
      [2.5, 0.16]
    ]),
    track(fire.id, 'clusters', [
      [0, 3],
      [0.9, 5],
      [1.8, 4],
      [2.5, 3]
    ]),
    track(fire.id, 'size', [
      [0, 0.34],
      [0.9, 0.5],
      [1.8, 0.42],
      [2.5, 0.36]
    ])
  ]
  doc.camera = { position: [0, 2.3, 5.4], target: [0, 1.1, 0], fov: 42 }
  return doc
}

/* ---------------------------------- 爆炸 ---------------------------------- */
function buildExplosion(): EffectDoc {
  const doc = emptyDoc('冲击爆炸')
  doc.duration = 2
  doc.bloomStrength = 0.45

  const flash = createModel('sphere', {
    name: '核心闪光',
    transform: { position: [0, 1.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    material: {
      color: '#ffe2b0',
      emissive: '#ff8a2b',
      emissiveIntensity: 1.2,
      metalness: 0,
      roughness: 0.4,
      opacity: 0.9,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const sparks = createParticle({
    name: '爆点火花',
    transform: { position: [0, 1.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 0, burst: true, burstCount: 230, burstInterval: 0, shape: 'sphere', radius: 0.1, surface: true, lifetimeMin: 0.45, lifetimeMax: 1.15, duration: 0.05 },
    motion: {
      speedMin: 3,
      speedMax: 9,
      direction: [0, 1, 0],
      spread: 180,
      gravity: [0, -2.2, 0],
      damping: 3.2,
      turbulence: 1.4,
      turbulenceScale: 2
    },
    sizeBase: 0.34,
    sizeCurve: c([
      [0, 1],
      [0.5, 0.6],
      [1, 0.05]
    ]),
    gradient: grad([
      [0, '#ffffff'],
      [0.25, '#ffd066'],
      [0.6, '#ff6a12'],
      [1, '#8a1200']
    ]),
    brightness: 1.35,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 1, stretch: 0.05 },
    render: { textureId: 'tex_spark', blend: 'additive', maxCount: 3400, opacity: 1, fadeIn: 0.02, fadeOut: 0.3 }
  })

  const smoke = createParticle({
    name: '烟云',
    transform: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 0, burst: true, burstCount: 38, burstInterval: 0, shape: 'sphere', radius: 0.35, lifetimeMin: 1.2, lifetimeMax: 2.4, duration: 0.08 },
    motion: {
      speedMin: 0.8,
      speedMax: 2.4,
      direction: [0, 1, 0],
      spread: 120,
      gravity: [-0.1, 1.1, 0],
      damping: 2.2,
      turbulence: 1.6,
      turbulenceScale: 1.1,
      swirl: 0.7
    },
    sizeBase: 1.1,
    sizeCurve: c([
      [0, 0.5],
      [0.4, 1.4],
      [1, 2.6]
    ]),
    gradient: grad([
      [0, '#ffb066'],
      [0.15, '#6b6259'],
      [0.6, '#31312f'],
      [1, '#101010']
    ]),
    brightness: 1,
    spin: { angleMin: 0, angleMax: 360, speedMin: -25, speedMax: 25, align: 0, stretch: 0 },
    render: { textureId: 'tex_smoke', blend: 'alpha', maxCount: 300, opacity: 0.85, fadeIn: 0.15, fadeOut: 0.5 }
  })

  const shockRing = createModel('ring', {
    name: '冲击环',
    transform: { position: [0, 0.06, 0], rotation: [-90, 0, 0], scale: [1, 1, 1] },
    params: { size: 1, radius: 1, tube: 0.2, segments: 72, rings: 8, thickness: 0.35, angle: 360, detail: 1, deform: 0, seed: 1 },
    material: {
      color: '#ffd9a0',
      emissive: '#ff9b3a',
      emissiveIntensity: 1.4,
      metalness: 0,
      roughness: 0.5,
      opacity: 1,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  doc.objects = [flash, sparks, smoke, shockRing]
  doc.tracks = [
    track(flash.id, 'scale', [
      [0, [0.2, 0.2, 0.2]],
      [0.09, [1.5, 1.5, 1.5]],
      [0.4, [2.6, 2.6, 2.6]]
    ]),
    track(flash.id, 'opacity', [
      [0, 1],
      [0.15, 0.95],
      [0.4, 0]
    ]),
    track(shockRing.id, 'scale', [
      [0, [0.2, 0.2, 0.2]],
      [0.55, [3.2, 3.2, 3.2]]
    ]),
    track(shockRing.id, 'opacity', [
      [0, 1],
      [0.3, 0.7],
      [0.7, 0]
    ])
  ]
  doc.camera = { position: [3.2, 3.2, 6.2], target: [0, 1, 0], fov: 45 }
  return doc
}

/* --------------------------------- 魔法阵 --------------------------------- */
function buildMagic(): EffectDoc {
  const doc = emptyDoc('奥术法阵')
  doc.duration = 4
  doc.bg = '#050512'

  const circle = createModel('disc', {
    name: '法阵符文',
    transform: { position: [0, 0.02, 0], rotation: [-90, 0, 0], scale: [2.2, 2.2, 2.2] },
    material: {
      color: '#7db6ff',
      emissive: '#2f7bff',
      emissiveIntensity: 1.1,
      metalness: 0,
      roughness: 1,
      opacity: 1,
      wireframe: false,
      textureId: 'tex_magic',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const inner = createModel('disc', {
    name: '内层法阵',
    transform: { position: [0, 0.04, 0], rotation: [-90, 0, 0], scale: [1.15, 1.15, 1.15] },
    material: {
      color: '#a891ff',
      emissive: '#5f3dff',
      emissiveIntensity: 1.2,
      metalness: 0,
      roughness: 1,
      opacity: 1,
      wireframe: false,
      textureId: 'tex_magic',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const pillar = createModel('cylinder', {
    name: '光柱',
    transform: { position: [0, 1.2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    params: { size: 2.4, radius: 0.62, tube: 0.2, segments: 24, rings: 16, thickness: 0.3, angle: 360, detail: 1, deform: 0, seed: 1 },
    material: {
      color: '#3f7dff',
      emissive: '#2d6bff',
      emissiveIntensity: 0.8,
      metalness: 0,
      roughness: 0.6,
      opacity: 0.16,
      wireframe: true,
      textureId: '',
      uvRepeat: 2,
      flatShading: false,
      blend: 'additive'
    }
  })

  const motes = createParticle({
    name: '奥术微粒',
    transform: { position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 150, shape: 'ring', radius: 1.05, lifetimeMin: 1.1, lifetimeMax: 2.4, burst: false },
    motion: {
      speedMin: 0.3,
      speedMax: 1.4,
      direction: [0, 1, 0],
      spread: 12,
      gravity: [0, 0.6, 0],
      damping: 0.8,
      turbulence: 0.5,
      turbulenceScale: 3,
      swirl: 0.8
    },
    sizeBase: 0.16,
    sizeCurve: c([
      [0, 0.2],
      [0.3, 1],
      [1, 0.2]
    ]),
    gradient: grad([
      [0, '#d8f0ff'],
      [0.4, '#66b8ff'],
      [1, '#3c2bff']
    ]),
    brightness: 1.7,
    spin: { angleMin: 0, angleMax: 360, speedMin: -60, speedMax: 60, align: 0, stretch: 0 },
    render: { textureId: 'tex_star', blend: 'additive', maxCount: 1600, opacity: 1, fadeIn: 0.2, fadeOut: 0.4 }
  })

  doc.objects = [circle, inner, pillar, motes]
  doc.tracks = [
    track(circle.id, 'rotation', [
      [0, [-90, 0, 0]],
      [4, [-90, 0, 360]]
    ]),
    track(inner.id, 'rotation', [
      [0, [-90, 0, 0]],
      [4, [-90, 0, -540]]
    ]),
    track(pillar.id, 'scale', [
      [0, [0.9, 1, 0.9]],
      [2, [1.05, 1.02, 1.05]],
      [4, [0.9, 1, 0.9]]
    ]),
    track(circle.id, 'opacity', [
      [0, 0.55],
      [1, 1],
      [4, 0.55]
    ])
  ]
  doc.camera = { position: [0, 3.1, 5.6], target: [0, 1.2, 0], fov: 46 }
  return doc
}

/* --------------------------------- 刀光 ---------------------------------- */
function buildSlash(): EffectDoc {
  const doc = emptyDoc('斩击刀光')
  doc.duration = 0.8
  doc.loop = false
  doc.bloomStrength = 1.2

  const arc = createModel('arc', {
    name: '刀光弧',
    transform: { position: [0, 1.2, 0], rotation: [0, -35, 40], scale: [1.6, 1.6, 1.6] },
    params: { size: 1, radius: 1.2, tube: 0.2, segments: 72, rings: 8, thickness: 0.14, angle: 165, detail: 1, deform: 0, seed: 1 },
    material: {
      color: '#d9f7ff',
      emissive: '#7fe0ff',
      emissiveIntensity: 2.4,
      metalness: 0,
      roughness: 0.3,
      opacity: 1,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const sparks = createParticle({
    name: '斩击火花',
    transform: { position: [0, 1.2, 0], rotation: [0, -35, 40], scale: [1, 1, 1] },
    emission: { rate: 0, burst: true, burstCount: 180, burstInterval: 0, shape: 'ring', radius: 1.1, lifetimeMin: 0.15, lifetimeMax: 0.5, duration: 0.04 },
    motion: {
      speedMin: 4,
      speedMax: 9,
      direction: [0, 0.2, 1],
      spread: 40,
      gravity: [0, -2, 0],
      damping: 4,
      turbulence: 0.8,
      turbulenceScale: 2,
      radial: 1.5
    },
    sizeBase: 0.22,
    sizeCurve: c([
      [0, 1],
      [1, 0.1]
    ]),
    gradient: grad([
      [0, '#ffffff'],
      [0.4, '#9fe8ff'],
      [1, '#2b74ff']
    ]),
    brightness: 3,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 1, stretch: 0.08 },
    render: { textureId: 'tex_spark', blend: 'additive', maxCount: 900, opacity: 1, fadeIn: 0.02, fadeOut: 0.2 }
  })

  doc.objects = [arc, sparks]
  doc.tracks = [
    track(arc.id, 'scale', [
      [0, [0.6, 0.6, 0.6]],
      [0.22, [2.1, 2.1, 2.1]],
      [0.55, [2.4, 2.4, 2.4]]
    ]),
    track(arc.id, 'rotation', [
      [0, [0, -35, -18]],
      [0.35, [0, -35, 62]]
    ]),
    track(arc.id, 'opacity', [
      [0, 0.15],
      [0.12, 1],
      [0.45, 0]
    ])
  ]
  doc.camera = { position: [0, 2.2, 5.2], target: [0, 1.2, 0], fov: 42 }
  return doc
}

/* --------------------------------- 治疗 ---------------------------------- */
function buildHeal(): EffectDoc {
  const doc = emptyDoc('治疗光环')
  doc.duration = 3

  const ring = createModel('ring', {
    name: '治疗环',
    transform: { position: [0, 0.05, 0], rotation: [-90, 0, 0], scale: [0.9, 0.9, 0.9] },
    params: { size: 1, radius: 0.9, tube: 0.2, segments: 64, rings: 8, thickness: 0.12, angle: 360, detail: 1, deform: 0, seed: 1 },
    material: {
      color: '#c6ffd9',
      emissive: '#41ff9e',
      emissiveIntensity: 2.2,
      metalness: 0,
      roughness: 1,
      opacity: 1,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const motes = createParticle({
    name: '治疗光点',
    transform: { position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 120, shape: 'ring', radius: 0.7, lifetimeMin: 1.2, lifetimeMax: 2.2, burst: false },
    motion: {
      speedMin: 0.4,
      speedMax: 1.6,
      direction: [0, 1, 0],
      spread: 10,
      gravity: [0, 0.4, 0],
      damping: 0.6,
      turbulence: 0.35,
      turbulenceScale: 2.6,
      swirl: 0.4
    },
    sizeBase: 0.2,
    sizeCurve: c([
      [0, 0.3],
      [0.25, 1],
      [1, 0.1]
    ]),
    gradient: grad([
      [0, '#f2fff6'],
      [0.45, '#6affb9'],
      [1, '#11b86a']
    ]),
    brightness: 2.2,
    spin: { angleMin: 0, angleMax: 360, speedMin: -70, speedMax: 70, align: 0, stretch: 0 },
    render: { textureId: 'tex_glow', blend: 'additive', maxCount: 1400, opacity: 1, fadeIn: 0.2, fadeOut: 0.4 }
  })

  const leaves = createParticle({
    name: '叶影',
    transform: { position: [0, 0.2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 30, shape: 'circle', radius: 0.6, lifetimeMin: 1.6, lifetimeMax: 2.6, burst: false },
    motion: {
      speedMin: 0.5,
      speedMax: 1.1,
      direction: [0, 1, 0],
      spread: 25,
      gravity: [0, 0.5, 0],
      damping: 0.4,
      turbulence: 0.9,
      turbulenceScale: 1.8,
      swirl: 1.4
    },
    sizeBase: 0.24,
    sizeCurve: c([
      [0, 0.4],
      [0.5, 1],
      [1, 0.5]
    ]),
    gradient: grad([
      [0, '#eafff2'],
      [0.5, '#4dffa6'],
      [1, '#0c7a45']
    ]),
    brightness: 1.5,
    spin: { angleMin: 0, angleMax: 360, speedMin: -90, speedMax: 90, align: 0, stretch: 0 },
    render: { textureId: 'tex_leaf', blend: 'alpha', maxCount: 400, opacity: 0.9, fadeIn: 0.2, fadeOut: 0.5 }
  })

  doc.objects = [ring, motes, leaves]
  doc.tracks = [
    track(ring.id, 'scale', [
      [0, [0.75, 0.75, 0.75]],
      [3, [1.25, 1.25, 1.25]]
    ]),
    track(ring.id, 'rotation', [
      [0, [-90, 0, 0]],
      [3, [-90, 0, 180]]
    ])
  ]
  doc.camera = { position: [0, 2.6, 5.2], target: [0, 1, 0], fov: 44 }
  return doc
}

/* --------------------------------- 雷电 ---------------------------------- */
function buildLightning(): EffectDoc {
  const doc = emptyDoc('雷电冲击')
  doc.duration = 1.4
  doc.loop = false

  const bolt = createModel('plane', {
    name: '电弧面片',
    transform: { position: [0, 1.4, 0], rotation: [0, 0, 12], scale: [1.4, 2.4, 1] },
    material: {
      color: '#e8f4ff',
      emissive: '#67b6ff',
      emissiveIntensity: 3.6,
      metalness: 0,
      roughness: 0.5,
      opacity: 1,
      wireframe: false,
      textureId: 'tex_bolt',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const impact = createParticle({
    name: '落点电火花',
    transform: { position: [0, 0.15, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 0, burst: true, burstCount: 220, burstInterval: 0.35, shape: 'circle', radius: 0.5, lifetimeMin: 0.25, lifetimeMax: 0.9, duration: 1 },
    motion: {
      speedMin: 2,
      speedMax: 7,
      direction: [0, 1, 0],
      spread: 85,
      gravity: [0, -3, 0],
      damping: 2.4,
      turbulence: 2.2,
      turbulenceScale: 2.4
    },
    sizeBase: 0.2,
    sizeCurve: c([
      [0, 1],
      [1, 0.1]
    ]),
    gradient: grad([
      [0, '#ffffff'],
      [0.35, '#8ad4ff'],
      [1, '#2b52ff']
    ]),
    brightness: 3.2,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 1, stretch: 0.06 },
    render: { textureId: 'tex_bolt', blend: 'additive', maxCount: 1800, opacity: 1, fadeIn: 0.02, fadeOut: 0.25 }
  })

  const glowRing = createModel('ring', {
    name: '落点光环',
    transform: { position: [0, 0.02, 0], rotation: [-90, 0, 0], scale: [1.2, 1.2, 1.2] },
    params: { size: 1, radius: 1, tube: 0.2, segments: 64, rings: 8, thickness: 0.22, angle: 360, detail: 1, deform: 0, seed: 1 },
    material: {
      color: '#cfe8ff',
      emissive: '#4ea8ff',
      emissiveIntensity: 4,
      metalness: 0,
      roughness: 0.8,
      opacity: 1,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  doc.objects = [bolt, impact, glowRing]
  doc.tracks = [
    track(bolt.id, 'opacity', [
      [0, 0],
      [0.06, 1],
      [0.18, 0.4],
      [0.26, 1],
      [0.42, 0],
      [0.6, 0.85],
      [0.8, 0]
    ], false),
    track(glowRing.id, 'scale', [
      [0, [0.4, 0.4, 0.4]],
      [0.7, [3.4, 3.4, 3.4]]
    ]),
    track(glowRing.id, 'opacity', [
      [0.1, 1],
      [0.8, 0]
    ])
  ]
  doc.camera = { position: [2.6, 2.4, 6.4], target: [0, 1.2, 0], fov: 46 }
  return doc
}

/* --------------------------------- 冰霜 ---------------------------------- */
function buildFrost(): EffectDoc {
  const doc = emptyDoc('冰霜新星')
  doc.duration = 2.2
  doc.loop = false
  doc.bg = '#040b12'
  doc.bloomStrength = 0.5

  const nova = createModel('disc', {
    name: '霜爆环',
    transform: { position: [0, 0.03, 0], rotation: [-90, 0, 0], scale: [1, 1, 1] },
    params: { radius: 1, segments: 64 },
    material: {
      color: '#cfefff',
      emissive: '#57b6e8',
      emissiveIntensity: 0.9,
      metalness: 0,
      roughness: 0.5,
      opacity: 0.9,
      wireframe: false,
      textureId: 'tex_ring',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const shards = createParticle({
    name: '冰棱飞散',
    transform: { position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: {
      rate: 0,
      burst: true,
      burstCount: 150,
      burstInterval: 0,
      shape: 'circle',
      radius: 0.55,
      lifetimeMin: 0.5,
      lifetimeMax: 1.2,
      duration: 0.06
    },
    motion: {
      speedMin: 3,
      speedMax: 7.5,
      direction: [0, 1, 0],
      spread: 70,
      gravity: [0, -2.6, 0],
      damping: 2.2,
      turbulence: 0.6,
      turbulenceScale: 2,
      radial: 1.2
    },
    sizeBase: 0.2,
    sizeCurve: c([
      [0, 1],
      [0.7, 0.5],
      [1, 0.08]
    ]),
    gradient: grad([
      [0, '#ffffff'],
      [0.4, '#9fe8ff'],
      [1, '#2f8cff']
    ]),
    brightness: 1.1,
    spin: { angleMin: 0, angleMax: 360, speedMin: -30, speedMax: 30, align: 1, stretch: 0.05 },
    render: { textureId: 'tex_shard', blend: 'additive', maxCount: 1600, opacity: 0.8, fadeIn: 0.02, fadeOut: 0.25 }
  })

  const spike = createModel('crystal', {
    name: '冰晶簇',
    transform: { position: [0, 0.6, 0], rotation: [0, 30, 0], scale: [0.55, 1.5, 0.55] },
    params: { radius: 0.5, detail: 1, deform: 0.35, segments: 6 },
    material: {
      color: '#eaffff',
      emissive: '#5fd0ff',
      emissiveIntensity: 0.85,
      metalness: 0.1,
      roughness: 0.15,
      opacity: 0.45,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: true,
      blend: 'additive'
    }
  })

  const mist = createParticle({
    name: '冰霜寒雾',
    transform: { position: [0, 0.15, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 45, shape: 'circle', radius: 0.9, lifetimeMin: 0.8, lifetimeMax: 1.7, burst: false },
    motion: {
      speedMin: 0.4,
      speedMax: 1.4,
      direction: [0, 1, 0],
      spread: 30,
      gravity: [0, 0.9, 0],
      damping: 0.7,
      turbulence: 0.9,
      turbulenceScale: 1.8,
      swirl: 0.9
    },
    sizeBase: 0.55,
    sizeCurve: c([
      [0, 0.4],
      [0.3, 1],
      [1, 1.3]
    ]),
    gradient: grad([
      [0, '#dff5ff'],
      [0.45, '#7fb6d8'],
      [1, '#22475e']
    ]),
    brightness: 0.6,
    spin: { angleMin: 0, angleMax: 360, speedMin: -25, speedMax: 25, align: 0, stretch: 0 },
    render: { textureId: 'tex_smoke', blend: 'alpha', maxCount: 500, opacity: 0.22, fadeIn: 0.2, fadeOut: 0.55 }
  })

  doc.objects = [nova, shards, spike, mist]
  doc.tracks = [
    track(nova.id, 'scale', [
      [0, [0.2, 0.2, 0.2]],
      [0.7, [2.6, 2.6, 2.6]]
    ]),
    track(nova.id, 'opacity', [
      [0, 1],
      [0.45, 0.7],
      [0.9, 0]
    ]),
    track(spike.id, 'scale', [
      [0, [0.2, 0.2, 0.2]],
      [0.18, [0.62, 1.7, 0.62]],
      [1.8, [0.4, 0.9, 0.4]]
    ]),
    track(spike.id, 'opacity', [
      [0, 0],
      [0.14, 0.6],
      [1.6, 0]
    ])
  ]
  doc.camera = { position: [0, 2.6, 6.2], target: [0, 0.7, 0], fov: 44 }
  return doc
}

/* --------------------------------- 陨石 ---------------------------------- */
function buildMeteor(): EffectDoc {
  const doc = emptyDoc('陨石坠落')
  doc.duration = 2.2
  doc.loop = false
  doc.bg = '#0a0605'
  doc.bloomStrength = 0.6

  const rock = createModel('rock', {
    name: '陨石',
    transform: { position: [2.4, 6.2, -1.2], rotation: [0, 0, 0], scale: [1, 1, 1] },
    params: { radius: 0.55, detail: 2, deform: 0.5, seed: 4 },
    material: {
      color: '#2f2823',
      emissive: '#ff5a12',
      emissiveIntensity: 1.1,
      metalness: 0.15,
      roughness: 0.9,
      opacity: 1,
      wireframe: false,
      textureId: 'tex_noise',
      uvRepeat: 2,
      flatShading: true,
      blend: 'opaque'
    }
  })

  const trail = createParticle({
    name: '火焰尾迹',
    transform: { position: [2.4, 6.2, -1.2], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 130, shape: 'sphere', radius: 0.45, lifetimeMin: 0.22, lifetimeMax: 0.55, burst: false },
    motion: {
      speedMin: 0,
      speedMax: 0.2,
      direction: [0, 1, 0],
      spread: 180,
      gravity: [0, 0.4, 0],
      damping: 1,
      turbulence: 1.1,
      turbulenceScale: 2.2
    },
    sizeBase: 0.4,
    sizeCurve: c([
      [0, 0.4],
      [0.25, 1],
      [1, 0.9]
    ]),
    gradient: grad([
      [0, '#fff3c0'],
      [0.3, '#ff9a2e'],
      [0.75, '#c12300'],
      [1, '#2a0f08']
    ]),
    brightness: 1,
    spin: { angleMin: 0, angleMax: 360, speedMin: -50, speedMax: 50, align: 0, stretch: 0 },
    render: { textureId: 'tex_flame', blend: 'additive', maxCount: 1600, opacity: 0.45, fadeIn: 0.05, fadeOut: 0.55 }
  })

  const flash = createModel('sphere', {
    name: '撞击闪光',
    transform: { position: [0, 0.45, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    material: {
      color: '#ffe2b0',
      emissive: '#ff7a18',
      emissiveIntensity: 0.8,
      metalness: 0,
      roughness: 0.4,
      opacity: 1,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const shock = createModel('ring', {
    name: '地裂冲击环',
    transform: { position: [0, 0.05, 0], rotation: [-90, 0, 0], scale: [1, 1, 1] },
    params: { radius: 1, thickness: 0.16, segments: 72, rings: 8 },
    material: {
      color: '#ffd7a8',
      emissive: '#ff8a2e',
      emissiveIntensity: 1.5,
      metalness: 0,
      roughness: 0.6,
      opacity: 1,
      wireframe: false,
      textureId: 'tex_ring',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const dust = createParticle({
    name: '碎石尘烟',
    transform: { position: [0, 0.2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 0, burst: true, burstCount: 60, burstInterval: 0, shape: 'circle', radius: 0.9, lifetimeMin: 1.2, lifetimeMax: 2.2, duration: 0.05 },
    motion: {
      speedMin: 1.4,
      speedMax: 3.6,
      direction: [0, 1, 0],
      spread: 88,
      gravity: [0, 1.4, 0],
      damping: 2.6,
      turbulence: 1.5,
      turbulenceScale: 1.3,
      swirl: 0.5
    },
    sizeBase: 0.9,
    sizeCurve: c([
      [0, 0.4],
      [0.35, 1.3],
      [1, 2.2]
    ]),
    gradient: grad([
      [0, '#9a7a5a'],
      [0.4, '#4a4239'],
      [1, '#12100e']
    ]),
    brightness: 0.65,
    spin: { angleMin: 0, angleMax: 360, speedMin: -25, speedMax: 25, align: 0, stretch: 0 },
    render: { textureId: 'tex_smoke', blend: 'alpha', maxCount: 400, opacity: 0.7, fadeIn: 0.1, fadeOut: 0.6 }
  })

  doc.objects = [rock, trail, flash, shock, dust]
  doc.tracks = [
    track(rock.id, 'position', [
      [0, [2.4, 6.2, -1.2]],
      [0.55, [0.12, 0.5, 0]],
      [2.2, [0.04, 0.22, 0]]
    ]),
    track(rock.id, 'rotation', [
      [0, [0, 0, 0]],
      [2.2, [210, 280, 120]]
    ]),
    track(trail.id, 'position', [
      [0, [2.4, 6.2, -1.2]],
      [0.55, [0.12, 0.6, 0]],
      [2.2, [0.04, 0.3, 0]]
    ]),
    track(flash.id, 'scale', [
      [0, [0.02, 0.02, 0.02]],
      [0.53, [0.02, 0.02, 0.02]],
      [0.62, [1.2, 1.2, 1.2]],
      [1, [1.7, 1.7, 1.7]]
    ]),
    track(flash.id, 'opacity', [
      [0, 0],
      [0.53, 0],
      [0.6, 0.95],
      [0.95, 0]
    ]),
    track(shock.id, 'scale', [
      [0, [0.2, 0.2, 0.2]],
      [0.55, [0.2, 0.2, 0.2]],
      [1.35, [5.2, 5.2, 5.2]]
    ]),
    track(shock.id, 'opacity', [
      [0, 0],
      [0.55, 0.9],
      [1.35, 0]
    ])
  ]
  doc.camera = { position: [4.4, 3.8, 7.6], target: [0, 0.9, 0], fov: 46 }
  return doc
}

/* --------------------------------- 剧毒 ---------------------------------- */
function buildPoison(): EffectDoc {
  const doc = emptyDoc('剧毒领域')
  doc.duration = 4
  doc.bg = '#060a05'

  const field = createModel('disc', {
    name: '毒雾地面',
    transform: { position: [0, 0.02, 0], rotation: [-90, 0, 0], scale: [2, 2, 2] },
    material: {
      color: '#8bff4a',
      emissive: '#3fbf22',
      emissiveIntensity: 0.35,
      metalness: 0,
      roughness: 1,
      opacity: 0.15,
      wireframe: false,
      textureId: 'tex_noise',
      uvRepeat: 3,
      flatShading: false,
      blend: 'additive'
    }
  })

  const bubbles = createParticle({
    name: '毒泡',
    transform: { position: [0, 0.08, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 110, shape: 'circle', radius: 0.85, lifetimeMin: 1.2, lifetimeMax: 2.6, burst: false },
    motion: {
      speedMin: 0.3,
      speedMax: 1.2,
      direction: [0, 1, 0],
      spread: 10,
      gravity: [0, 0.7, 0],
      damping: 0.5,
      turbulence: 0.8,
      turbulenceScale: 1.6,
      swirl: 1.4
    },
    sizeBase: 0.3,
    sizeCurve: c([
      [0, 0.2],
      [0.25, 1],
      [1, 0.15]
    ]),
    gradient: grad([
      [0, '#f4ffcf'],
      [0.4, '#9dff4a'],
      [1, '#1f7a12']
    ]),
    brightness: 1.5,
    spin: { angleMin: 0, angleMax: 360, speedMin: -40, speedMax: 40, align: 0, stretch: 0 },
    render: { textureId: 'tex_glow', blend: 'additive', maxCount: 1400, opacity: 0.9, fadeIn: 0.15, fadeOut: 0.5 }
  })

  const cloud = createParticle({
    name: '毒云',
    transform: { position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 26, shape: 'circle', radius: 1.1, lifetimeMin: 2, lifetimeMax: 3.6, burst: false },
    motion: {
      speedMin: 0.2,
      speedMax: 0.7,
      direction: [0, 1, 0],
      spread: 25,
      gravity: [0, 0.35, 0],
      damping: 0.6,
      turbulence: 1.2,
      turbulenceScale: 1.1,
      swirl: 1.1
    },
    sizeBase: 1.5,
    sizeCurve: c([
      [0, 0.6],
      [0.4, 1.5],
      [1, 1.9]
    ]),
    gradient: grad([
      [0, '#b6ff86'],
      [0.3, '#3d7a24'],
      [1, '#0a1a08']
    ]),
    brightness: 0.75,
    spin: { angleMin: 0, angleMax: 360, speedMin: -20, speedMax: 20, align: 0, stretch: 0 },
    render: { textureId: 'tex_smoke', blend: 'alpha', maxCount: 300, opacity: 0.32, fadeIn: 0.3, fadeOut: 0.6 }
  })

  const spores = createParticle({
    name: '孢子弹',
    transform: { position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 22, shape: 'ring', radius: 0.8, lifetimeMin: 0.9, lifetimeMax: 1.8, burst: false },
    motion: {
      speedMin: 0.8,
      speedMax: 2,
      direction: [0, 1, 0],
      spread: 46,
      gravity: [0, -0.3, 0],
      damping: 1.4,
      turbulence: 1.1,
      turbulenceScale: 2,
      swirl: 0.9
    },
    sizeBase: 0.09,
    sizeCurve: c([
      [0, 1],
      [1, 0.2]
    ]),
    gradient: grad([
      [0, '#eaffc4'],
      [0.5, '#7dff3f'],
      [1, '#2a8f14']
    ]),
    brightness: 1.8,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 1, stretch: 0.04 },
    render: { textureId: 'tex_spark', blend: 'additive', maxCount: 700, opacity: 0.85, fadeIn: 0.05, fadeOut: 0.35 }
  })

  doc.objects = [field, bubbles, cloud, spores]
  doc.tracks = [
    track(field.id, 'rotation', [
      [0, [-90, 0, 0]],
      [4, [-90, 0, 55]]
    ])
  ]
  doc.camera = { position: [0, 2.9, 5.6], target: [0, 0.9, 0], fov: 45 }
  return doc
}

/* --------------------------------- 暗影 ---------------------------------- */
function buildShadow(): EffectDoc {
  const doc = emptyDoc('暗影侵蚀')
  doc.duration = 3.4
  doc.bg = '#060409'

  const knot = createModel('torusKnot', {
    name: '暗影核心',
    transform: { position: [0, 1.35, 0], rotation: [0, 0, 0], scale: [0.55, 0.55, 0.55] },
    material: {
      color: '#c9a6ff',
      emissive: '#7a2bff',
      emissiveIntensity: 1.2,
      metalness: 0.3,
      roughness: 0.4,
      opacity: 0.82,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const circle = createModel('disc', {
    name: '侵蚀符文',
    transform: { position: [0, 0.02, 0], rotation: [-90, 0, 0], scale: [1.6, 1.6, 1.6] },
    material: {
      color: '#a06bff',
      emissive: '#5f19d6',
      emissiveIntensity: 0.9,
      metalness: 0,
      roughness: 1,
      opacity: 0.42,
      wireframe: false,
      textureId: 'tex_magic',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const fog = createParticle({
    name: '黑雾',
    transform: { position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 55, shape: 'circle', radius: 0.55, lifetimeMin: 1.2, lifetimeMax: 2.4, burst: false },
    motion: {
      speedMin: 0.5,
      speedMax: 1.6,
      direction: [0, 1, 0],
      spread: 20,
      gravity: [0, 1.2, 0],
      damping: 0.8,
      turbulence: 1.4,
      turbulenceScale: 1.2,
      swirl: 1.9
    },
    sizeBase: 0.9,
    sizeCurve: c([
      [0, 0.4],
      [0.35, 1.2],
      [1, 1.7]
    ]),
    gradient: grad([
      [0, '#a06bff'],
      [0.35, '#3a0f66'],
      [1, '#05030a']
    ]),
    brightness: 0.9,
    spin: { angleMin: 0, angleMax: 360, speedMin: -30, speedMax: 30, align: 0, stretch: 0 },
    render: { textureId: 'tex_smoke', blend: 'alpha', maxCount: 420, opacity: 0.5, fadeIn: 0.2, fadeOut: 0.55 }
  })

  const shards = createParticle({
    name: '暗影碎片',
    transform: { position: [0, 0.15, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 42, shape: 'ring', radius: 0.7, lifetimeMin: 0.5, lifetimeMax: 1.2, burst: false },
    motion: {
      speedMin: 1.6,
      speedMax: 4,
      direction: [0, 1, 0],
      spread: 34,
      gravity: [0, 1.4, 0],
      damping: 1.6,
      turbulence: 1.1,
      turbulenceScale: 1.8,
      swirl: 1.3
    },
    sizeBase: 0.16,
    sizeCurve: c([
      [0, 1],
      [1, 0.1]
    ]),
    gradient: grad([
      [0, '#e2d0ff'],
      [0.45, '#a06bff'],
      [1, '#2a0b4d']
    ]),
    brightness: 2,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 1, stretch: 0.05 },
    render: { textureId: 'tex_shard', blend: 'additive', maxCount: 900, opacity: 0.9, fadeIn: 0.05, fadeOut: 0.3 }
  })

  doc.objects = [circle, knot, fog, shards]
  doc.tracks = [
    track(knot.id, 'rotation', [
      [0, [0, 0, 0]],
      [3.4, [0, 360, 240]]
    ]),
    track(circle.id, 'rotation', [
      [0, [-90, 0, 0]],
      [3.4, [-90, 0, -160]]
    ]),
    track(knot.id, 'scale', [
      [0, [0.5, 0.5, 0.5]],
      [1.7, [0.62, 0.62, 0.62]],
      [3.4, [0.5, 0.5, 0.5]]
    ])
  ]
  doc.camera = { position: [2.2, 2.6, 5.4], target: [0, 1.2, 0], fov: 46 }
  return doc
}

/* --------------------------------- 护盾 ---------------------------------- */
function buildShield(): EffectDoc {
  const doc = emptyDoc('圣光护盾')
  doc.duration = 3
  doc.bg = '#0a0805'

  const dome = createModel('icosahedron', {
    name: '护盾穹顶',
    transform: { position: [0, 1.0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    params: { radius: 1, detail: 2 },
    material: {
      color: '#ffe9b0',
      emissive: '#ffb733',
      emissiveIntensity: 0.55,
      metalness: 0,
      roughness: 0.5,
      opacity: 0.3,
      wireframe: true,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const core = createModel('icosahedron', {
    name: '内核网格',
    transform: { position: [0, 1.0, 0], rotation: [0, 0, 0], scale: [0.95, 0.95, 0.95] },
    params: { radius: 1, detail: 1 },
    material: {
      color: '#fff3d0',
      emissive: '#ffb03a',
      emissiveIntensity: 0.5,
      metalness: 0,
      roughness: 0.6,
      opacity: 0.16,
      wireframe: true,
      textureId: '',
      uvRepeat: 1,
      flatShading: true,
      blend: 'additive'
    }
  })

  const base = createModel('ring', {
    name: '脚下光环',
    transform: { position: [0, 0.03, 0], rotation: [-90, 0, 0], scale: [1.05, 1.05, 1.05] },
    params: { radius: 1, thickness: 0.1, segments: 72, rings: 8 },
    material: {
      color: '#ffeec2',
      emissive: '#ffb733',
      emissiveIntensity: 1.1,
      metalness: 0,
      roughness: 0.4,
      opacity: 1,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const motes = createParticle({
    name: '圣光微粒',
    transform: { position: [0, 1.0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 90, shape: 'sphere', radius: 1, surface: true, lifetimeMin: 0.8, lifetimeMax: 1.6, burst: false },
    motion: {
      speedMin: 0.1,
      speedMax: 0.6,
      direction: [0, 1, 0],
      spread: 20,
      gravity: [0, 0.5, 0],
      damping: 0.6,
      turbulence: 0.4,
      turbulenceScale: 2,
      swirl: 0.5
    },
    sizeBase: 0.13,
    sizeCurve: c([
      [0, 0.3],
      [0.3, 1],
      [1, 0.2]
    ]),
    gradient: grad([
      [0, '#fffdf2'],
      [0.5, '#ffd166'],
      [1, '#c07a1a']
    ]),
    brightness: 1.5,
    spin: { angleMin: 0, angleMax: 360, speedMin: -50, speedMax: 50, align: 0, stretch: 0 },
    render: { textureId: 'tex_star', blend: 'additive', maxCount: 1200, opacity: 0.9, fadeIn: 0.2, fadeOut: 0.4 }
  })

  doc.objects = [dome, core, base, motes]
  doc.tracks = [
    track(dome.id, 'scale', [
      [0, [0.96, 0.98, 0.96]],
      [1.5, [1.04, 1.02, 1.04]],
      [3, [0.96, 0.98, 0.96]]
    ]),
    track(core.id, 'rotation', [
      [0, [0, 0, 0]],
      [3, [120, -240, 60]]
    ]),
    track(base.id, 'rotation', [
      [0, [-90, 0, 0]],
      [3, [-90, 0, 180]]
    ])
  ]
  doc.camera = { position: [0, 2.4, 5.2], target: [0, 1, 0], fov: 44 }
  return doc
}

/* --------------------------------- 虚空 ---------------------------------- */
function buildPortal(): EffectDoc {
  const doc = emptyDoc('虚空裂隙')
  doc.duration = 4
  doc.bg = '#07030f'

  const vortex = createModel('disc', {
    name: '旋涡面',
    transform: { position: [0, 1.5, 0], rotation: [0, 0, 0], scale: [1.5, 1.5, 1.5] },
    material: {
      color: '#c86bff',
      emissive: '#6a1fd8',
      emissiveIntensity: 1,
      metalness: 0,
      roughness: 1,
      opacity: 0.45,
      wireframe: false,
      textureId: 'tex_magic',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const halo = createModel('torus', {
    name: '裂隙环',
    transform: { position: [0, 1.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    params: { radius: 0.95, tube: 0.06, segments: 96, rings: 12 },
    material: {
      color: '#e6c8ff',
      emissive: '#a24dff',
      emissiveIntensity: 0.85,
      metalness: 0.2,
      roughness: 0.35,
      opacity: 0.95,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const core = createModel('sphere', {
    name: '虚空核',
    transform: { position: [0, 1.5, 0], rotation: [0, 0, 0], scale: [0.45, 0.45, 0.45] },
    params: { radius: 1, segments: 24, rings: 14 },
    material: {
      color: '#efe0ff',
      emissive: '#8f2bff',
      emissiveIntensity: 0.8,
      metalness: 0,
      roughness: 0.6,
      opacity: 0.5,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const motes = createParticle({
    name: '虚空微粒',
    transform: { position: [0, 1.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 120, shape: 'circle', radius: 0.95, lifetimeMin: 1, lifetimeMax: 2, burst: false },
    motion: {
      speedMin: 0.4,
      speedMax: 1.2,
      direction: [0, 1, 0],
      spread: 18,
      gravity: [0, 0.2, 0],
      damping: 0.5,
      turbulence: 0.6,
      turbulenceScale: 2.4,
      swirl: 2.4
    },
    sizeBase: 0.14,
    sizeCurve: c([
      [0, 0.3],
      [0.3, 1],
      [1, 0.15]
    ]),
    gradient: grad([
      [0, '#fbefff'],
      [0.4, '#c86bff'],
      [1, '#3a0a7a']
    ]),
    brightness: 1.6,
    spin: { angleMin: 0, angleMax: 360, speedMin: -80, speedMax: 80, align: 0, stretch: 0 },
    render: { textureId: 'tex_star', blend: 'additive', maxCount: 1500, opacity: 0.95, fadeIn: 0.2, fadeOut: 0.45 }
  })

  doc.objects = [vortex, halo, core, motes]
  doc.tracks = [
    track(vortex.id, 'rotation', [
      [0, [0, 0, 0]],
      [4, [0, 0, 360]]
    ]),
    track(halo.id, 'rotation', [
      [0, [0, 0, 0]],
      [4, [0, 0, -540]]
    ]),
    track(core.id, 'scale', [
      [0, [0.4, 0.4, 0.4]],
      [2, [0.5, 0.5, 0.5]],
      [4, [0.4, 0.4, 0.4]]
    ]),
    track(core.id, 'opacity', [
      [0, 0.5],
      [2, 0.8],
      [4, 0.5]
    ])
  ]
  doc.camera = { position: [0, 1.9, 5.4], target: [0, 1.5, 0], fov: 44 }
  return doc
}

/* -------------------------------- 烈焰喷射 ------------------------------- */
function buildJet(): EffectDoc {
  const doc = emptyDoc('烈焰喷射')
  doc.duration = 2.2
  doc.bg = '#0a0605'

  const jet = createParticle({
    name: '定向喷流',
    transform: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 560, shape: 'cone', radius: 0.18, coneAngle: 14, lifetimeMin: 0.3, lifetimeMax: 0.62, burst: false },
    motion: {
      speedMin: 4,
      speedMax: 7,
      direction: [0, 0, 1],
      spread: 13,
      gravity: [0, 0.45, 0],
      damping: 0.9,
      turbulence: 0.5,
      turbulenceScale: 1.6,
      swirl: 0.3
    },
    sizeBase: 0.15,
    sizeCurve: c([
      [0, 0.5],
      [0.25, 1],
      [1, 1.05]
    ]),
    gradient: grad([
      [0, '#fffdf0'],
      [0.3, '#ffa02a'],
      [0.7, '#ff5a10'],
      [1, '#a82400']
    ]),
    brightness: 0.74,
    spin: { angleMin: 0, angleMax: 360, speedMin: -30, speedMax: 30, align: 0.95, stretch: 0.06 },
    render: { textureId: 'tex_flame', blend: 'additive', maxCount: 4000, opacity: 0.46, fadeIn: 0.06, fadeOut: 0.4 }
  })

  const smoke = createParticle({
    name: '尾焰烟',
    transform: { position: [0, 1.05, 2.6], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 45, shape: 'sphere', radius: 0.7, lifetimeMin: 0.8, lifetimeMax: 1.7, burst: false },
    motion: {
      speedMin: 0.3,
      speedMax: 1.2,
      direction: [0, 1, 0],
      spread: 60,
      gravity: [0, 1, 0],
      damping: 1.2,
      turbulence: 1.3,
      turbulenceScale: 1.4,
      swirl: 0.6
    },
    sizeBase: 0.55,
    sizeCurve: c([
      [0, 0.4],
      [0.35, 1],
      [1, 1.5]
    ]),
    gradient: grad([
      [0, '#8a715c'],
      [0.4, '#3b322c'],
      [1, '#12100e']
    ]),
    brightness: 0.7,
    spin: { angleMin: 0, angleMax: 360, speedMin: -25, speedMax: 25, align: 0, stretch: 0 },
    render: { textureId: 'tex_smoke', blend: 'alpha', maxCount: 350, opacity: 0.28, fadeIn: 0.2, fadeOut: 0.55 }
  })

  doc.objects = [jet, smoke]
  doc.tracks = [
    track(jet.id, 'scale', [
      [0, [0.88, 0.9, 0.94]],
      [0.8, [1.04, 1, 1.08]],
      [2.2, [0.88, 0.9, 0.94]]
    ])
  ]
  doc.camera = { position: [3, 1.9, 4.8], target: [0, 1.1, 1.2], fov: 45 }
  return doc
}

/* --------------------------------- 火球术 -------------------------------- */
function buildFireball(): EffectDoc {
  const doc = emptyDoc('火球术')
  doc.duration = 1.8
  doc.loop = false
  doc.bg = '#080505'

  const core = createModel('sphere', {
    name: '火球',
    transform: { position: [-0.2, 1.6, -3.2], rotation: [0, 0, 0], scale: [1, 1, 1] },
    params: { radius: 0.34, segments: 24, rings: 14 },
    material: {
      color: '#ffdf9a',
      emissive: '#ff5a10',
      emissiveIntensity: 0.9,
      metalness: 0,
      roughness: 0.55,
      opacity: 0.9,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const trail = createParticle({
    name: '火球尾迹',
    transform: { position: [-0.2, 1.6, -3.2], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 200, shape: 'sphere', radius: 0.28, lifetimeMin: 0.2, lifetimeMax: 0.45, burst: false },
    motion: {
      speedMin: 0,
      speedMax: 0.25,
      direction: [0, 1, 0],
      spread: 180,
      gravity: [0, 0.35, 0],
      damping: 1.2,
      turbulence: 1,
      turbulenceScale: 2
    },
    sizeBase: 0.34,
    sizeCurve: c([
      [0, 0.5],
      [0.3, 1],
      [1, 0.85]
    ]),
    gradient: grad([
      [0, '#fffbe0'],
      [0.3, '#ff9a2e'],
      [0.75, '#c02600'],
      [1, '#2a0900']
    ]),
    brightness: 1.1,
    spin: { angleMin: 0, angleMax: 360, speedMin: -40, speedMax: 40, align: 0, stretch: 0 },
    render: { textureId: 'tex_smoke', blend: 'additive', maxCount: 1600, opacity: 0.5, fadeIn: 0.05, fadeOut: 0.5 }
  })

  const sparks = createParticle({
    name: '命中火花',
    transform: { position: [0.05, 0.25, 0.1], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 110, shape: 'circle', radius: 0.5, lifetimeMin: 0.4, lifetimeMax: 0.9, burst: false },
    motion: {
      speedMin: 2,
      speedMax: 5,
      direction: [0, 1, 0],
      spread: 80,
      gravity: [0, -2.4, 0],
      damping: 2.6,
      turbulence: 1.4,
      turbulenceScale: 2
    },
    sizeBase: 0.2,
    sizeCurve: c([
      [0, 1],
      [1, 0.1]
    ]),
    gradient: grad([
      [0, '#ffffff'],
      [0.35, '#ffd066'],
      [1, '#ff4a00']
    ]),
    brightness: 2,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 1, stretch: 0.05 },
    render: { textureId: 'tex_spark', blend: 'additive', maxCount: 1800, opacity: 1, fadeIn: 0.02, fadeOut: 0.25 }
  })

  const ring = createModel('ring', {
    name: '命中冲击环',
    transform: { position: [0, 0.05, 0], rotation: [-90, 0, 0], scale: [1, 1, 1] },
    params: { radius: 1, thickness: 0.14, segments: 72, rings: 8 },
    material: {
      color: '#ffd9a8',
      emissive: '#ff8a2e',
      emissiveIntensity: 1.4,
      metalness: 0,
      roughness: 0.6,
      opacity: 1,
      wireframe: false,
      textureId: 'tex_ring',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  doc.objects = [core, trail, sparks, ring]
  doc.tracks = [
    track(core.id, 'position', [
      [0, [-0.2, 1.6, -3.2]],
      [0.8, [0.05, 0.35, 0.1]]
    ]),
    track(trail.id, 'position', [
      [0, [-0.2, 1.6, -3.2]],
      [0.8, [0.05, 0.4, 0.1]]
    ]),
    track(core.id, 'scale', [
      [0, [0.75, 0.75, 0.75]],
      [0.5, [1, 1, 1]],
      [0.82, [1.15, 1.15, 1.15]],
      [1.2, [0.2, 0.2, 0.2]]
    ]),
    track(core.id, 'opacity', [
      [0, 1],
      [0.8, 1],
      [1.2, 0]
    ]),
    track(ring.id, 'scale', [
      [0, [0.2, 0.2, 0.2]],
      [0.78, [0.2, 0.2, 0.2]],
      [1.5, [3.8, 3.8, 3.8]]
    ]),
    track(ring.id, 'opacity', [
      [0, 0],
      [0.78, 0.9],
      [1.5, 0]
    ]),
    track(sparks.id, 'opacity', [
      [0, 0],
      [0.76, 0],
      [0.82, 0.95],
      [1.35, 0]
    ])
  ]
  doc.camera = { position: [3.4, 2.2, 5.4], target: [0.1, 0.9, 0], fov: 45 }
  return doc
}

/* -------------------------------- 火焰冲击波 ------------------------------ */
function buildWave(): EffectDoc {
  const doc = emptyDoc('火焰冲击波')
  doc.duration = 2
  doc.loop = false
  doc.bg = '#0a0604'
  doc.bloomStrength = 0.6

  const wall = createParticle({
    name: '火墙',
    transform: { position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 0, burst: true, burstCount: 260, burstInterval: 0, shape: 'ring', radius: 1.05, lifetimeMin: 0.45, lifetimeMax: 1.05, duration: 0.05 },
    motion: {
      speedMin: 1.8,
      speedMax: 3.6,
      direction: [0, 1, 0],
      spread: 24,
      gravity: [0, 2.2, 0],
      damping: 1.6,
      turbulence: 1.1,
      turbulenceScale: 1.8,
      radial: 2.4
    },
    sizeBase: 0.42,
    sizeCurve: c([
      [0, 0.5],
      [0.3, 1.1],
      [1, 0.5]
    ]),
    gradient: grad([
      [0, '#fff6d0'],
      [0.3, '#ffb24a'],
      [0.7, '#d13000'],
      [1, '#300800']
    ]),
    brightness: 1,
    spin: { angleMin: 0, angleMax: 360, speedMin: -20, speedMax: 20, align: 1, stretch: 0.04 },
    render: { textureId: 'tex_smoke', blend: 'additive', maxCount: 2600, opacity: 0.55, fadeIn: 0.05, fadeOut: 0.45 }
  })

  const sparks = createParticle({
    name: '飞溅火星',
    transform: { position: [0, 0.12, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 0, burst: true, burstCount: 130, burstInterval: 0, shape: 'ring', radius: 1.05, lifetimeMin: 0.4, lifetimeMax: 1.1, duration: 0.04 },
    motion: {
      speedMin: 3,
      speedMax: 7,
      direction: [0, 1, 0],
      spread: 50,
      gravity: [0, -1.8, 0],
      damping: 2.4,
      turbulence: 1.6,
      turbulenceScale: 2.2,
      radial: 1.8
    },
    sizeBase: 0.14,
    sizeCurve: c([
      [0, 1],
      [1, 0.1]
    ]),
    gradient: grad([
      [0, '#fffdf0'],
      [0.4, '#ffbe4a'],
      [1, '#ff3c00']
    ]),
    brightness: 2,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 1, stretch: 0.06 },
    render: { textureId: 'tex_spark', blend: 'additive', maxCount: 1200, opacity: 0.95, fadeIn: 0.02, fadeOut: 0.3 }
  })

  const waveRing = createModel('disc', {
    name: '冲击光环',
    transform: { position: [0, 0.03, 0], rotation: [-90, 0, 0], scale: [1, 1, 1] },
    params: { radius: 1, segments: 64 },
    material: {
      color: '#ffb066',
      emissive: '#ff5a12',
      emissiveIntensity: 0.6,
      metalness: 0,
      roughness: 0.6,
      opacity: 0.5,
      wireframe: false,
      textureId: 'tex_ring',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const charred = createModel('disc', {
    name: '焦土',
    transform: { position: [0, 0.01, 0], rotation: [-90, 0, 0], scale: [2, 2, 2] },
    params: { radius: 1, segments: 48 },
    material: {
      color: '#120d0a',
      emissive: '#2a0f06',
      emissiveIntensity: 0.3,
      metalness: 0,
      roughness: 1,
      opacity: 1,
      wireframe: false,
      textureId: 'tex_noise',
      uvRepeat: 3,
      flatShading: false,
      blend: 'opaque'
    }
  })

  doc.objects = [charred, waveRing, wall, sparks]
  doc.tracks = [
    track(waveRing.id, 'scale', [
      [0, [0.35, 0.35, 0.35]],
      [1.1, [3.6, 3.6, 3.6]]
    ]),
    track(waveRing.id, 'opacity', [
      [0, 1],
      [0.55, 0.6],
      [1.2, 0]
    ])
  ]
  doc.camera = { position: [0, 1.9, 5.8], target: [0, 0.5, 0], fov: 46 }
  return doc
}

/* -------------------------------- 烈焰风暴 -------------------------------- */
function buildFirestorm(): EffectDoc {
  const doc = emptyDoc('烈焰风暴')
  doc.duration = 3.6
  doc.bg = '#0b0503'

  const column = createModel('cylinder', {
    name: '火柱内芯',
    transform: { position: [0, 1.8, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    params: { size: 3.6, radius: 0.32, segments: 20, rings: 12 },
    material: {
      color: '#ff9c4a',
      emissive: '#ff4d12',
      emissiveIntensity: 0.45,
      metalness: 0,
      roughness: 0.7,
      opacity: 0.4,
      wireframe: false,
      textureId: 'tex_flame',
      uvRepeat: 2,
      flatShading: false,
      blend: 'additive'
    }
  })

  const twister = createParticle({
    name: '龙卷火焰',
    transform: { position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 520, shape: 'circle', radius: 1.05, lifetimeMin: 0.9, lifetimeMax: 1.9, burst: false },
    motion: {
      speedMin: 1.2,
      speedMax: 2.4,
      direction: [0, 1, 0],
      spread: 12,
      gravity: [0, 2.2, 0],
      damping: 0.5,
      turbulence: 1.6,
      turbulenceScale: 2,
      swirl: 3.4
    },
    sizeBase: 0.22,
    sizeCurve: c([
      [0, 0.4],
      [0.2, 1],
      [1, 0.3]
    ]),
    gradient: grad([
      [0, '#fff0c0'],
      [0.3, '#ffa22e'],
      [0.75, '#d22b00'],
      [1, '#2b0a00']
    ]),
    brightness: 1,
    spin: { angleMin: 0, angleMax: 360, speedMin: -60, speedMax: 60, align: 0.85, stretch: 0.08 },
    render: { textureId: 'tex_smoke', blend: 'additive', maxCount: 3200, opacity: 0.5, fadeIn: 0.1, fadeOut: 0.45 }
  })

  const tongues = createParticle({
    name: '旋绕火舌',
    transform: { position: [0, 0.15, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 300, shape: 'circle', radius: 0.95, lifetimeMin: 0.55, lifetimeMax: 1.15, burst: false },
    motion: {
      speedMin: 1.6,
      speedMax: 3,
      direction: [0, 1, 0],
      spread: 10,
      gravity: [0, 2.4, 0],
      damping: 0.45,
      turbulence: 1.8,
      turbulenceScale: 1.8,
      swirl: 4.2
    },
    sizeBase: 0.16,
    sizeCurve: c([
      [0, 0.45],
      [0.25, 1],
      [1, 0.35]
    ]),
    gradient: grad([
      [0, '#fff6d8'],
      [0.32, '#ffa62e'],
      [0.78, '#e03400'],
      [1, '#3a0c00']
    ]),
    brightness: 0.95,
    spin: { angleMin: 0, angleMax: 360, speedMin: -70, speedMax: 70, align: 0.9, stretch: 0.07 },
    render: { textureId: 'tex_flame', blend: 'additive', maxCount: 2600, opacity: 0.5, fadeIn: 0.08, fadeOut: 0.4 }
  })

  const crown = createParticle({
    motion: {
      speedMin: 0.5,
      speedMax: 1.4,
      direction: [0, 1, 0],
      spread: 70,
      gravity: [0, 1.1, 0],
      damping: 1,
      turbulence: 1.5,
      turbulenceScale: 2.2,
      swirl: 1.2
    },
    sizeBase: 0.3,
    sizeCurve: c([
      [0, 0.5],
      [0.3, 1.1],
      [1, 0.8]
    ]),
    gradient: grad([
      [0, '#ffe6b0'],
      [0.35, '#ff9a2e'],
      [1, '#8a1c00']
    ]),
    brightness: 1,
    spin: { angleMin: 0, angleMax: 360, speedMin: -40, speedMax: 40, align: 0, stretch: 0 },
    render: { textureId: 'tex_smoke', blend: 'additive', maxCount: 900, opacity: 0.42, fadeIn: 0.15, fadeOut: 0.5 }
  })

  const embers = createParticle({
    name: '旋飞火星',
    transform: { position: [0, 0.2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 46, shape: 'circle', radius: 1.1, lifetimeMin: 0.8, lifetimeMax: 1.8, burst: false },
    motion: {
      speedMin: 3,
      speedMax: 6,
      direction: [0, 1, 0],
      spread: 30,
      gravity: [0, 1.4, 0],
      damping: 1.2,
      turbulence: 1.8,
      turbulenceScale: 2.4,
      swirl: 2.6
    },
    sizeBase: 0.1,
    sizeCurve: c([
      [0, 1],
      [1, 0.1]
    ]),
    gradient: grad([
      [0, '#fffbe8'],
      [0.5, '#ffae2e'],
      [1, '#ff2f00']
    ]),
    brightness: 1.8,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 1, stretch: 0.035 },
    render: { textureId: 'tex_spark', blend: 'additive', maxCount: 900, opacity: 0.85, fadeIn: 0.05, fadeOut: 0.35 }
  })

  doc.objects = [glowDisc('地面热光', 2.6, 0.34), column, twister, tongues, crown, embers]
  doc.tracks = [
    track(column.id, 'rotation', [
      [0, [0, 0, 0]],
      [3.6, [0, 200, 0]]
    ]),
    track(column.id, 'scale', [
      [0, [0.9, 1, 0.9]],
      [1.8, [1.06, 1.04, 1.06]],
      [3.6, [0.9, 1, 0.9]]
    ])
  ]
  doc.camera = { position: [0, 2.8, 6.6], target: [0, 1.4, 0], fov: 46 }
  return doc
}

/* -------------------------------- 岩浆喷发 -------------------------------- */
function buildLava(): EffectDoc {
  const doc = emptyDoc('岩浆喷发')
  doc.duration = 2.6
  doc.bg = '#070403'

  const pool = createModel('disc', {
    name: '熔岩池',
    transform: { position: [0, 0.02, 0], rotation: [-90, 0, 0], scale: [1.8, 1.8, 1.8] },
    params: { radius: 1, segments: 56 },
    material: {
      color: '#ff6a18',
      emissive: '#c23000',
      emissiveIntensity: 0.55,
      metalness: 0,
      roughness: 0.9,
      opacity: 0.5,
      wireframe: false,
      textureId: 'tex_noise',
      uvRepeat: 3,
      flatShading: false,
      blend: 'additive'
    }
  })

  const crust = createModel('ring', {
    name: '火山口',
    transform: { position: [0, 0.06, 0], rotation: [-90, 0, 0], scale: [1, 1, 1] },
    params: { radius: 0.95, thickness: 0.26, segments: 48, rings: 6 },
    material: {
      color: '#3a2318',
      emissive: '#7a1e00',
      emissiveIntensity: 0.6,
      metalness: 0.1,
      roughness: 0.95,
      opacity: 1,
      wireframe: false,
      textureId: 'tex_noise',
      uvRepeat: 2,
      flatShading: true,
      blend: 'opaque'
    }
  })

  const jet = createParticle({
    name: '岩浆喷柱',
    transform: { position: [0, 0.15, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 280, shape: 'circle', radius: 0.38, lifetimeMin: 0.5, lifetimeMax: 1.1, burst: false },
    motion: {
      speedMin: 3,
      speedMax: 6.5,
      direction: [0, 1, 0],
      spread: 12,
      gravity: [0, -2.2, 0],
      damping: 1.2,
      turbulence: 1,
      turbulenceScale: 1.6
    },
    sizeBase: 0.3,
    sizeCurve: c([
      [0, 0.5],
      [0.25, 1],
      [1, 0.7]
    ]),
    gradient: grad([
      [0, '#fffbe0'],
      [0.25, '#ffa528'],
      [0.7, '#e83800'],
      [1, '#5c1200']
    ]),
    brightness: 1.05,
    spin: { angleMin: 0, angleMax: 360, speedMin: -30, speedMax: 30, align: 1, stretch: 0.06 },
    render: { textureId: 'tex_flame', blend: 'additive', maxCount: 2600, opacity: 0.5, fadeIn: 0.05, fadeOut: 0.45 }
  })

  const drops = createParticle({
    name: '熔岩滴',
    transform: { position: [0, 0.2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 36, shape: 'sphere', radius: 0.5, lifetimeMin: 0.5, lifetimeMax: 1, burst: false },
    motion: {
      speedMin: 2,
      speedMax: 5,
      direction: [0, 1, 0],
      spread: 55,
      gravity: [0, -3.2, 0],
      damping: 0.9,
      turbulence: 0.9,
      turbulenceScale: 1.8
    },
    sizeBase: 0.12,
    sizeCurve: c([
      [0, 1],
      [1, 0.2]
    ]),
    gradient: grad([
      [0, '#fffbe0'],
      [0.4, '#ffb030'],
      [1, '#a82600']
    ]),
    brightness: 2,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 1, stretch: 0.06 },
    render: { textureId: 'tex_glow', blend: 'additive', maxCount: 700, opacity: 0.95, fadeIn: 0.02, fadeOut: 0.3 }
  })

  doc.objects = [glowDisc('熔岩热光', 2.6, 0.32, '#ff5a12', '#ff2500'), pool, crust, jet, drops]
  doc.tracks = [
    track(pool.id, 'rotation', [
      [0, [-90, 0, 0]],
      [2.6, [-90, 0, 40]]
    ]),
    track(pool.id, 'opacity', [
      [0, 0.4],
      [1.3, 0.62],
      [2.6, 0.4]
    ])
  ]
  doc.camera = { position: [3.2, 2.2, 5.4], target: [0, 0.8, 0], fov: 46 }
  return doc
}

/* --------------------------------- 灼烧 ---------------------------------- */
function buildBurning(): EffectDoc {
  const doc = emptyDoc('灼烧地面')
  doc.duration = 4
  doc.bg = '#080604'

  const ground = createModel('disc', {
    name: '焦土',
    transform: { position: [0, 0.01, 0], rotation: [-90, 0, 0], scale: [2, 2, 2] },
    params: { radius: 1, segments: 48 },
    material: {
      color: '#130e0a',
      emissive: '#3a1204',
      emissiveIntensity: 0.35,
      metalness: 0,
      roughness: 1,
      opacity: 1,
      wireframe: false,
      textureId: 'tex_noise',
      uvRepeat: 3,
      flatShading: false,
      blend: 'opaque'
    }
  })

  const glow = createModel('disc', {
    name: '余温光斑',
    transform: { position: [0, 0.02, 0], rotation: [-90, 0, 0], scale: [1.9, 1.9, 1.9] },
    params: { radius: 1, segments: 40 },
    material: {
      color: '#ff8a2a',
      emissive: '#d63c00',
      emissiveIntensity: 0.6,
      metalness: 0,
      roughness: 1,
      opacity: 0.28,
      wireframe: false,
      textureId: 'tex_ring',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const flames = createParticle({
    name: '地面火苗',
    transform: { position: [0, 0.03, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: {
      rate: 240,
      shape: 'box',
      size: [2.2, 0.04, 2.2],
      lifetimeMin: 0.5,
      lifetimeMax: 0.95,
      burst: false
    },
    motion: {
      speedMin: 0.5,
      speedMax: 1.2,
      direction: [0, 1, 0],
      spread: 6,
      gravity: [0, 1.4, 0],
      damping: 0.9,
      turbulence: 0.5,
      turbulenceScale: 1.6,
      swirl: 0.3
    },
    sizeBase: 0.34,
    sizeCurve: c([
      [0, 0.45],
      [0.25, 1],
      [1, 0.55]
    ]),
    gradient: grad([
      [0, '#fff2c4'],
      [0.3, '#ff9c26'],
      [0.75, '#c82800'],
      [1, '#1e0600']
    ]),
    brightness: 0.9,
    spin: { angleMin: -18, angleMax: 18, speedMin: -12, speedMax: 12, align: 0, stretch: 0 },
    render: { textureId: 'tex_flame', blend: 'additive', maxCount: 2200, opacity: 0.55, fadeIn: 0.12, fadeOut: 0.55 }
  })

  const embers = createParticle({
    name: '升腾余烬',
    transform: { position: [0, 0.3, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 42, shape: 'circle', radius: 1.15, lifetimeMin: 1, lifetimeMax: 2.2, burst: false },
    motion: {
      speedMin: 0.5,
      speedMax: 1.4,
      direction: [0, 1, 0],
      spread: 20,
      gravity: [0, 1.1, 0],
      damping: 0.7,
      turbulence: 1.5,
      turbulenceScale: 2,
      swirl: 0.6
    },
    sizeBase: 0.09,
    sizeCurve: c([
      [0, 1],
      [1, 0.15]
    ]),
    gradient: grad([
      [0, '#fffbe4'],
      [0.5, '#ffb13a'],
      [1, '#ff3a00']
    ]),
    brightness: 1.7,
    spin: { angleMin: 0, angleMax: 360, speedMin: -20, speedMax: 20, align: 1, stretch: 0.03 },
    render: { textureId: 'tex_spark', blend: 'additive', maxCount: 700, opacity: 0.8, fadeIn: 0.05, fadeOut: 0.4 }
  })

  doc.objects = [ground, glow, flames, embers]
  doc.tracks = [
    track(glow.id, 'opacity', [
      [0, 0.2],
      [2, 0.36],
      [4, 0.2]
    ])
  ]
  doc.camera = { position: [0, 2.8, 5.8], target: [0, 0.4, 0], fov: 46 }
  return doc
}

/* -------------------------------- 火焰护体 -------------------------------- */
function buildAura(): EffectDoc {
  const doc = emptyDoc('火焰护体')
  doc.duration = 3
  doc.bg = '#070504'

  const belt = createModel('torus', {
    name: '火环',
    transform: { position: [0, 0.95, 0], rotation: [-90, 0, 0], scale: [1, 1, 1] },
    params: { radius: 0.85, tube: 0.02, segments: 96, rings: 12 },
    material: {
      color: '#ff7a2a',
      emissive: '#ff3a00',
      emissiveIntensity: 0.5,
      metalness: 0,
      roughness: 0.5,
      opacity: 0.65,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const feet = createModel('ring', {
    name: '脚下火环',
    transform: { position: [0, 0.03, 0], rotation: [-90, 0, 0], scale: [1, 1, 1] },
    params: { radius: 0.72, thickness: 0.05, segments: 64, rings: 8 },
    material: {
      color: '#ff8a3a',
      emissive: '#ff3a00',
      emissiveIntensity: 0.45,
      metalness: 0,
      roughness: 0.6,
      opacity: 0.6,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const flames = createParticle({
    name: '环体火焰',
    transform: { position: [0, 0.05, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 240, shape: 'ring', radius: 0.85, lifetimeMin: 0.7, lifetimeMax: 1.4, burst: false },
    motion: {
      speedMin: 0.6,
      speedMax: 1.6,
      direction: [0, 1, 0],
      spread: 14,
      gravity: [0, 1.6, 0],
      damping: 0.8,
      turbulence: 1,
      turbulenceScale: 1.6,
      swirl: 2.4
    },
    sizeBase: 0.26,
    sizeCurve: c([
      [0, 0.35],
      [0.25, 1],
      [1, 0.5]
    ]),
    gradient: grad([
      [0, '#fff6cf'],
      [0.3, '#ffa83a'],
      [0.75, '#e03a00'],
      [1, '#2a0800']
    ]),
    brightness: 1.1,
    spin: { angleMin: 0, angleMax: 360, speedMin: -40, speedMax: 40, align: 1, stretch: 0.015 },
    render: { textureId: 'tex_smoke', blend: 'additive', maxCount: 2000, opacity: 0.5, fadeIn: 0.1, fadeOut: 0.45 }
  })

  const motes = createParticle({
    name: '火星',
    transform: { position: [0, 0.4, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 34, shape: 'circle', radius: 0.9, lifetimeMin: 0.6, lifetimeMax: 1.3, burst: false },
    motion: {
      speedMin: 0.6,
      speedMax: 2,
      direction: [0, 1, 0],
      spread: 24,
      gravity: [0, 1.2, 0],
      damping: 1.3,
      turbulence: 1.4,
      turbulenceScale: 2.2,
      swirl: 1.8
    },
    sizeBase: 0.08,
    sizeCurve: c([
      [0, 1],
      [1, 0.2]
    ]),
    gradient: grad([
      [0, '#fffbe4'],
      [0.5, '#ffb13a'],
      [1, '#ff3a00']
    ]),
    brightness: 1.8,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 1, stretch: 0.03 },
    render: { textureId: 'tex_spark', blend: 'additive', maxCount: 600, opacity: 0.85, fadeIn: 0.05, fadeOut: 0.35 }
  })

  doc.objects = [glowDisc('脚下暖光', 1.5, 0.26), belt, feet, flames, motes]
  doc.tracks = [
    track(belt.id, 'scale', [
      [0, [0.96, 0.96, 0.96]],
      [1.5, [1.06, 1.06, 1.06]],
      [3, [0.96, 0.96, 0.96]]
    ]),
    track(feet.id, 'rotation', [
      [0, [-90, 0, 0]],
      [3, [-90, 0, -120]]
    ]),
    track(belt.id, 'position', [
      [0, [0, 0.92, 0]],
      [1.5, [0, 1.02, 0]],
      [3, [0, 0.92, 0]]
    ])
  ]
  doc.camera = { position: [0, 2, 4.8], target: [0, 0.9, 0], fov: 44 }
  return doc
}

/* --------------------------------- 龙息 ---------------------------------- */
function buildBreath(): EffectDoc {
  const doc = emptyDoc('龙息')
  doc.duration = 2.4
  doc.bg = '#0a0604'

  const muzzle = createModel('sphere', {
    name: '喷口',
    transform: { position: [0, 1.2, 0.12], rotation: [0, 0, 0], scale: [1, 1, 1] },
    params: { radius: 0.1, segments: 20, rings: 12 },
    material: {
      color: '#ffc078',
      emissive: '#ff7a1e',
      emissiveIntensity: 0.35,
      metalness: 0,
      roughness: 0.5,
      opacity: 0.35,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const stream = createParticle({
    name: '扇形火流',
    transform: { position: [0, 1.2, 0.15], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 460, shape: 'cone', radius: 0.16, coneAngle: 22, lifetimeMin: 0.3, lifetimeMax: 0.6, burst: false },
    motion: {
      speedMin: 4.5,
      speedMax: 7.5,
      direction: [0, 0, 1],
      spread: 6,
      gravity: [0, 0.4, 0],
      damping: 0.6,
      turbulence: 0.7,
      turbulenceScale: 1.8,
      swirl: 0.2
    },
    sizeBase: 0.26,
    sizeCurve: c([
      [0, 0.45],
      [0.2, 1],
      [1, 1.2]
    ]),
    gradient: grad([
      [0, '#fffdf0'],
      [0.3, '#ffae2c'],
      [0.7, '#ff4a08'],
      [1, '#7a1600']
    ]),
    brightness: 0.95,
    spin: { angleMin: 0, angleMax: 360, speedMin: -40, speedMax: 40, align: 1, stretch: 0.05 },
    render: { textureId: 'tex_flame', blend: 'additive', maxCount: 3200, opacity: 0.5, fadeIn: 0.05, fadeOut: 0.45 }
  })

  const smoke = createParticle({
    name: '烟浪',
    transform: { position: [0, 1.3, 3], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 50, shape: 'sphere', radius: 1, lifetimeMin: 0.8, lifetimeMax: 1.8, burst: false },
    motion: {
      speedMin: 0.2,
      speedMax: 1,
      direction: [0, 1, 0],
      spread: 70,
      gravity: [0, 1.2, 0],
      damping: 1.1,
      turbulence: 1.5,
      turbulenceScale: 1.4,
      swirl: 0.8
    },
    sizeBase: 0.9,
    sizeCurve: c([
      [0, 0.5],
      [0.4, 1.2],
      [1, 1.8]
    ]),
    gradient: grad([
      [0, '#8a6f58'],
      [0.4, '#3a302a'],
      [1, '#100d0b']
    ]),
    brightness: 0.7,
    spin: { angleMin: 0, angleMax: 360, speedMin: -25, speedMax: 25, align: 0, stretch: 0 },
    render: { textureId: 'tex_smoke', blend: 'alpha', maxCount: 350, opacity: 0.3, fadeIn: 0.2, fadeOut: 0.55 }
  })

  doc.objects = [muzzle, stream, smoke]
  doc.tracks = [
    track(stream.id, 'scale', [
      [0, [0.92, 0.94, 1]],
      [0.9, [1.05, 1, 1.12]],
      [1.8, [0.92, 0.94, 1]]
    ]),
    track(muzzle.id, 'scale', [
      [0, [0.9, 0.9, 0.9]],
      [0.6, [1.15, 1.15, 1.15]],
      [1.2, [0.9, 0.9, 0.9]]
    ])
  ]
  doc.camera = { position: [4.6, 2.1, 1.2], target: [0, 1.1, 2.2], fov: 46 }
  return doc
}

/* -------------------------------- 灰烬爆破 -------------------------------- */
function buildEmber(): EffectDoc {
  const doc = emptyDoc('灰烬爆破')
  doc.duration = 1.6
  doc.loop = false
  doc.bg = '#0a0705'

  const flash = createModel('sphere', {
    name: '爆心',
    transform: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    params: { radius: 0.32, segments: 24, rings: 14 },
    material: {
      color: '#ffd9a0',
      emissive: '#ff6a12',
      emissiveIntensity: 0.35,
      metalness: 0,
      roughness: 0.5,
      opacity: 0.85,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const sparks = createParticle({
    name: '余烬爆散',
    transform: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 0, burst: true, burstCount: 240, burstInterval: 0, shape: 'sphere', radius: 0.2, lifetimeMin: 0.6, lifetimeMax: 1.3, duration: 0.05 },
    motion: {
      speedMin: 2,
      speedMax: 6,
      direction: [0, 1, 0],
      spread: 180,
      gravity: [0, -1.4, 0],
      damping: 2.4,
      turbulence: 1.4,
      turbulenceScale: 2
    },
    sizeBase: 0.14,
    sizeCurve: c([
      [0, 1],
      [1, 0.15]
    ]),
    gradient: grad([
      [0, '#fffbe8'],
      [0.4, '#ffb236'],
      [1, '#ff3c00']
    ]),
    brightness: 1.8,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 1, stretch: 0.04 },
    render: { textureId: 'tex_spark', blend: 'additive', maxCount: 1800, opacity: 0.95, fadeIn: 0.02, fadeOut: 0.4 }
  })

  const ash = createParticle({
    name: '飘落灰烬',
    transform: { position: [0, 2.2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 30, shape: 'box', size: [1.8, 0.04, 1.8], lifetimeMin: 0.8, lifetimeMax: 1.5, burst: false },
    motion: {
      speedMin: 0.2,
      speedMax: 0.7,
      direction: [0, -1, 0],
      spread: 30,
      gravity: [0, -0.4, 0],
      damping: 0.5,
      turbulence: 1.1,
      turbulenceScale: 1.6,
      swirl: 0.4
    },
    sizeBase: 0.12,
    sizeCurve: c([
      [0, 1],
      [1, 0.5]
    ]),
    gradient: grad([
      [0, '#7a5c48'],
      [0.5, '#3a2c26'],
      [1, '#120d0b']
    ]),
    brightness: 0.8,
    spin: { angleMin: 0, angleMax: 360, speedMin: -40, speedMax: 40, align: 0, stretch: 0 },
    render: { textureId: 'tex_dot', blend: 'alpha', maxCount: 400, opacity: 0.6, fadeIn: 0.1, fadeOut: 0.5 }
  })

  const shock = createModel('ring', {
    name: '冲击环',
    transform: { position: [0, 0.05, 0], rotation: [-90, 0, 0], scale: [1, 1, 1] },
    params: { radius: 1, thickness: 0.14, segments: 72, rings: 8 },
    material: {
      color: '#ffd9a8',
      emissive: '#ff8a2e',
      emissiveIntensity: 1.2,
      metalness: 0,
      roughness: 0.6,
      opacity: 1,
      wireframe: false,
      textureId: 'tex_ring',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  doc.objects = [flash, sparks, ash, shock]
  doc.tracks = [
    track(flash.id, 'scale', [
      [0, [0.4, 0.4, 0.4]],
      [0.12, [1.1, 1.1, 1.1]],
      [0.5, [1.4, 1.4, 1.4]]
    ]),
    track(flash.id, 'opacity', [
      [0, 1],
      [0.18, 0.9],
      [0.5, 0]
    ]),
    track(shock.id, 'scale', [
      [0, [0.3, 0.3, 0.3]],
      [0.9, [3.6, 3.6, 3.6]]
    ]),
    track(shock.id, 'opacity', [
      [0, 0.9],
      [0.35, 0.6],
      [0.95, 0]
    ])
  ]
  doc.camera = { position: [3.4, 2.6, 6], target: [0, 1, 0], fov: 46 }
  return doc
}

/* -------------------------------- 火刃斩 -------------------------------- */
function buildFlameSlash(): EffectDoc {
  const doc = emptyDoc('火刃斩')
  doc.duration = 0.9
  doc.loop = false
  doc.bg = '#0a0605'
  doc.bloomStrength = 0.7

  const arc = createModel('arc', {
    name: '火刃弧',
    transform: { position: [0, 1.2, 0], rotation: [0, -30, 40], scale: [1, 1, 1] },
    params: { radius: 1.2, thickness: 0.09, segments: 72, rings: 8, angle: 170 },
    material: {
      color: '#ff9a3a',
      emissive: '#ff4a08',
      emissiveIntensity: 0.85,
      metalness: 0,
      roughness: 0.4,
      opacity: 1,
      wireframe: false,
      textureId: '',
      uvRepeat: 1,
      flatShading: false,
      blend: 'additive'
    }
  })

  const trail = createParticle({
    name: '刃身火焰',
    transform: { position: [0, 1.2, 0], rotation: [0, -30, 40], scale: [1, 1, 1] },
    emission: { rate: 0, burst: true, burstCount: 120, burstInterval: 0, shape: 'ring', radius: 1.15, lifetimeMin: 0.2, lifetimeMax: 0.45, duration: 0.04 },
    motion: {
      speedMin: 1,
      speedMax: 3,
      direction: [0, 0.3, 1],
      spread: 40,
      gravity: [0, 1.2, 0],
      damping: 2.4,
      turbulence: 1.2,
      turbulenceScale: 2,
      radial: 1.2
    },
    sizeBase: 0.26,
    sizeCurve: c([
      [0, 0.8],
      [1, 0.2]
    ]),
    gradient: grad([
      [0, '#fffbe8'],
      [0.35, '#ffb236'],
      [1, '#d62a00']
    ]),
    brightness: 1.2,
    spin: { angleMin: 0, angleMax: 360, speedMin: -30, speedMax: 30, align: 1, stretch: 0.02 },
    render: { textureId: 'tex_smoke', blend: 'additive', maxCount: 1400, opacity: 0.8, fadeIn: 0.02, fadeOut: 0.4 }
  })

  const sparks = createParticle({
    name: '斩击火星',
    transform: { position: [0, 1.2, 0], rotation: [0, -30, 40], scale: [1, 1, 1] },
    emission: { rate: 0, burst: true, burstCount: 160, burstInterval: 0, shape: 'ring', radius: 1.15, lifetimeMin: 0.15, lifetimeMax: 0.5, duration: 0.03 },
    motion: {
      speedMin: 4,
      speedMax: 8,
      direction: [0, 0.2, 1],
      spread: 42,
      gravity: [0, -2, 0],
      damping: 4,
      turbulence: 0.9,
      turbulenceScale: 2,
      radial: 1.6
    },
    sizeBase: 0.18,
    sizeCurve: c([
      [0, 1],
      [1, 0.1]
    ]),
    gradient: grad([
      [0, '#ffffff'],
      [0.4, '#ffd27a'],
      [1, '#ff3a00']
    ]),
    brightness: 2.2,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 1, stretch: 0.06 },
    render: { textureId: 'tex_spark', blend: 'additive', maxCount: 900, opacity: 1, fadeIn: 0.02, fadeOut: 0.25 }
  })

  doc.objects = [arc, trail, sparks]
  doc.tracks = [
    track(arc.id, 'scale', [
      [0, [0.45, 0.45, 0.45]],
      [0.22, [1.1, 1.1, 1.1]],
      [0.55, [1.28, 1.28, 1.28]]
    ]),
    track(arc.id, 'rotation', [
      [0, [0, -30, -20]],
      [0.36, [0, -30, 72]]
    ]),
    track(arc.id, 'opacity', [
      [0, 0.15],
      [0.12, 1],
      [0.5, 0]
    ])
  ]
  doc.camera = { position: [0, 2.4, 6.6], target: [0, 1.15, 0], fov: 44 }
  return doc
}

function buildSubEmit(): EffectDoc {
  const doc = emptyDoc('子发射演示')
  doc.duration = 3
  doc.bloomStrength = 0.5
  doc.camera = { position: [0, 2.9, 6.4], target: [0, 1.1, 0], fov: 45 }

  // 母体 A：向上喷射的火种，落到地面时溅起火星（触地触发）
  const fountain = createParticle({
    name: '喷柱火种',
    transform: { position: [0, 1.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 70, shape: 'cone', radius: 0.1, coneAngle: 10, lifetimeMin: 1.3, lifetimeMax: 1.9, burst: false },
    motion: {
      speedMin: 0.8,
      speedMax: 1.7,
      direction: [0, 1, 0],
      spread: 16,
      gravity: [0, -4.2, 0],
      damping: 0.2,
      turbulence: 0.25,
      turbulenceScale: 1.4
    },
    sizeBase: 0.2,
    sizeCurve: c([
      [0, 0.4],
      [0.3, 1],
      [1, 0.7]
    ]),
    gradient: grad([
      [0, '#fff4cf'],
      [0.4, '#ffb040'],
      [1, '#ff3c06']
    ]),
    brightness: 1.6,
    spin: { angleMin: 0, angleMax: 360, speedMin: -60, speedMax: 60, align: 1, stretch: 0.06 },
    render: { textureId: 'tex_spark', blend: 'additive', maxCount: 600, opacity: 0.9, fadeIn: 0.05, fadeOut: 0.2 }
  })
  // 生命内速度曲线：先快后慢，落点更集中
  fountain.speedCurve = c([
    [0, 1.1],
    [0.55, 0.8],
    [1, 0.45]
  ])
  // 生命内自旋倍率：起飞快转，下落时几乎停转
  fountain.spinCurve = c([
    [0, 1.4],
    [0.6, 0.7],
    [1, 0.1]
  ])
  fountain.sub = { enabled: true, targetId: '', trigger: 'ground', count: 2, inherit: 0.25, spread: 78 }

  // 母体 B：缓慢飘落的余烬，寿命结束时碎裂成尘（消亡触发）
  const motes = createParticle({
    name: '飘散余烬',
    transform: { position: [0, 1.7, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 26, shape: 'sphere', radius: 0.55, lifetimeMin: 0.7, lifetimeMax: 1.1, burst: false },
    motion: {
      speedMin: 0.1,
      speedMax: 0.35,
      direction: [0, -1, 0],
      spread: 70,
      gravity: [0, -0.45, 0],
      damping: 0.9,
      turbulence: 0.6,
      turbulenceScale: 2.2
    },
    sizeBase: 0.14,
    sizeCurve: c([
      [0, 1],
      [1, 0.6]
    ]),
    gradient: grad([
      [0, '#ffd07a'],
      [1, '#7a2400']
    ]),
    brightness: 1.2,
    spin: { angleMin: 0, angleMax: 360, speedMin: -20, speedMax: 20, align: 0, stretch: 0 },
    render: { textureId: 'tex_dust', blend: 'additive', maxCount: 500, opacity: 0.55, fadeIn: 0.08, fadeOut: 0.35 }
  })
  motes.sub = { enabled: true, targetId: '', trigger: 'death', count: 1, inherit: 0.15, spread: 150 }

  // 接收方 C：触地溅射火星（自身不发射，全都来自子发射注入）
  const sparks = createParticle({
    name: '溅射火星',
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 0, shape: 'point', radius: 0.05, lifetimeMin: 0.35, lifetimeMax: 0.8, burst: false },
    motion: {
      speedMin: 1.1,
      speedMax: 2.6,
      direction: [0, 1, 0],
      spread: 78,
      gravity: [0, -2.6, 0],
      damping: 0.6,
      turbulence: 0.5,
      turbulenceScale: 3
    },
    sizeBase: 0.065,
    sizeCurve: c([
      [0, 1],
      [1, 0.12]
    ]),
    gradient: grad([
      [0, '#ffffff'],
      [0.5, '#ffc66a'],
      [1, '#ff2d00']
    ]),
    brightness: 2.1,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 1, stretch: 0.035 },
    render: { textureId: 'tex_spark', blend: 'additive', maxCount: 900, opacity: 1, fadeIn: 0.02, fadeOut: 0.25 }
  })

  // 接收方 D：余烬碎裂出的细尘（同样只由子发射注入）
  const dust = createParticle({
    name: '余烬尘',
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 0, shape: 'point', radius: 0.05, lifetimeMin: 0.8, lifetimeMax: 1.5, burst: false },
    motion: {
      speedMin: 0.2,
      speedMax: 0.7,
      direction: [0, 1, 0],
      spread: 140,
      gravity: [0, 0.35, 0],
      damping: 1.4,
      turbulence: 1.2,
      turbulenceScale: 2.6
    },
    sizeBase: 0.16,
    sizeCurve: c([
      [0, 0.7],
      [1, 1.15]
    ]),
    gradient: grad([
      [0, '#c98a4a'],
      [1, '#5a3418']
    ]),
    brightness: 1.0,
    spin: { angleMin: 0, angleMax: 360, speedMin: -12, speedMax: 12, align: 0, stretch: 0 },
    render: { textureId: 'tex_dust', blend: 'alpha', maxCount: 900, opacity: 0.4, fadeIn: 0.15, fadeOut: 0.5 }
  })

  fountain.sub.targetId = sparks.id
  motes.sub.targetId = dust.id
  // 色标透明度演示：余烬尘出生半透明、中段最浓、末段淡出
  dust.gradient = {
    stops: [
      { t: 0, color: '#8a5a34', a: 0.25 },
      { t: 0.3, color: '#6b4020', a: 0.85 },
      { t: 1, color: '#241206', a: 0 }
    ]
  }
  doc.objects = [fountain, motes, sparks, dust]
  return doc
}

function buildBurst(): EffectDoc {
  const doc = emptyDoc('冲击爆点')
  doc.duration = 2.2
  doc.bloomStrength = 0.6
  doc.camera = { position: [0, 2.15, 6.2], target: [0, 1.0, 0], fov: 46 }

  // 序列帧爆闪：4×4 图集，按生命进度播放并停在末帧
  const flash = createParticle({
    name: '序列帧爆闪',
    transform: { position: [0, 1.02, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 0, burst: true, burstCount: 3, burstInterval: 0, shape: 'sphere', radius: 0.08, lifetimeMin: 0.55, lifetimeMax: 0.55, duration: 0.05 },
    motion: {
      speedMin: 0,
      speedMax: 0.15,
      direction: [0, 1, 0],
      spread: 8,
      gravity: [0, 0, 0],
      damping: 2,
      turbulence: 0,
      turbulenceScale: 1
    },
    sizeBase: 0.92,
    sizeCurve: c([
      [0, 1],
      [1, 1.04]
    ]),
    gradient: grad([
      [0, '#fff8e0'],
      [0.4, '#ffb44a'],
      [1, '#ff4400']
    ]),
    brightness: 1.45,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 0, stretch: 0 },
    render: {
      textureId: 'tex_flip',
      blend: 'additive',
      maxCount: 160,
      opacity: 0.8,
      fadeIn: 0.02,
      fadeOut: 0.1,
      flipbook: { enabled: true, cols: 4, rows: 4, holdLast: true, fps: 20 }
    }
  })

  // 碎石：带地面反弹，落点会小跳几下再停住
  const debris = createParticle({
    name: '碎石飞溅',
    transform: { position: [0, 1.02, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 0, burst: true, burstCount: 74, burstInterval: 0, shape: 'sphere', radius: 0.12, lifetimeMin: 1.1, lifetimeMax: 1.7, duration: 0.05 },
    motion: {
      speedMin: 1.2,
      speedMax: 4.6,
      direction: [0, 1, 0],
      spread: 78,
      gravity: [0, -3.6, 0],
      damping: 0.5,
      turbulence: 0.45,
      turbulenceScale: 2.4
    },
    sizeBase: 0.15,
    sizeCurve: c([
      [0, 1],
      [1, 0.65]
    ]),
    gradient: grad([
      [0, '#ffd9a0'],
      [0.6, '#c96a2a'],
      [1, '#3d1404']
    ]),
    brightness: 1.3,
    spin: { angleMin: 0, angleMax: 360, speedMin: -170, speedMax: 170, align: 0, stretch: 0 },
    render: {
      textureId: 'tex_shard',
      blend: 'additive',
      maxCount: 500,
      opacity: 0.9,
      fadeIn: 0.02,
      fadeOut: 0.35,
      mode: 'mesh',
      meshGeo: 'rock'
    }
  })
  debris.collide = { enabled: true, floor: 0.02, bounce: 0.45, friction: 0.6, kill: false }

  const ground = glowDisc('地面暖光', 1.75, 0.1, '#ff8a3a', '#ff3b00', 0.03)
  doc.objects = [flash, debris, ground]
  doc.tracks = [
    track(ground.id, 'opacity', [
      [0, 0.9],
      [0.25, 0.55],
      [1.2, 0.06]
    ])
  ]
  return doc
}

function buildShatter(): EffectDoc {
  const doc = emptyDoc('冰晶碎裂')
  doc.duration = 2.0
  doc.bloomStrength = 0.55
  doc.camera = { position: [0, 2.1, 6.0], target: [0, 1.0, 0], fov: 46 }

  // 爆点：冷白闪光贴片，短促一闪
  const flash = createParticle({
    name: '冰爆闪光',
    transform: { position: [0, 1.0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 0, burst: true, burstCount: 2, burstInterval: 0, shape: 'point', radius: 0.06, lifetimeMin: 0.4, lifetimeMax: 0.4, duration: 0.04 },
    motion: {
      speedMin: 0,
      speedMax: 0.1,
      direction: [0, 1, 0],
      spread: 5,
      gravity: [0, 0, 0],
      damping: 2,
      turbulence: 0,
      turbulenceScale: 1
    },
    sizeBase: 0.85,
    sizeCurve: c([
      [0, 1],
      [1, 1.05]
    ]),
    gradient: grad([
      [0, '#ffffff'],
      [0.35, '#bfeaff'],
      [1, '#3f7fbf']
    ]),
    brightness: 1.5,
    spin: { angleMin: 0, angleMax: 360, speedMin: 0, speedMax: 0, align: 0, stretch: 0 },
    render: { textureId: 'tex_flash', blend: 'additive', maxCount: 120, opacity: 0.85, fadeIn: 0.02, fadeOut: 0.12 }
  })

  // 冰晶碎块：实体八面体，落地弹跳后停住
  const crystals = createParticle({
    name: '冰晶碎块',
    transform: { position: [0, 1.0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    emission: { rate: 0, burst: true, burstCount: 58, burstInterval: 0, shape: 'sphere', radius: 0.1, lifetimeMin: 1.0, lifetimeMax: 1.6, duration: 0.05 },
    motion: {
      speedMin: 1.4,
      speedMax: 4.2,
      direction: [0, 1, 0],
      spread: 82,
      gravity: [0, -3.4, 0],
      damping: 0.45,
      turbulence: 0.3,
      turbulenceScale: 2.2
    },
    sizeBase: 0.14,
    sizeCurve: c([
      [0, 1],
      [1, 0.7]
    ]),
    gradient: grad([
      [0, '#f4fdff'],
      [0.45, '#91d8ff'],
      [1, '#16324f']
    ]),
    brightness: 1.15,
    spin: { angleMin: 0, angleMax: 360, speedMin: -180, speedMax: 180, align: 0, stretch: 0 },
    render: {
      textureId: 'tex_spark',
      blend: 'additive',
      maxCount: 400,
      opacity: 0.95,
      fadeIn: 0.02,
      fadeOut: 0.3,
      mode: 'mesh',
      meshGeo: 'crystal'
    }
  })
  crystals.collide = { enabled: true, floor: 0.02, bounce: 0.32, friction: 0.55, kill: false }

  // 地面冷光
  const ground = glowDisc('地面冷光', 1.7, 0.1, '#7fd4ff', '#1c4f8a', 0.03)
  doc.objects = [flash, crystals, ground]
  doc.tracks = [
    track(ground.id, 'opacity', [
      [0, 0.85],
      [0.3, 0.5],
      [1.1, 0.05]
    ])
  ]
  return doc
}

export const PRESETS: Preset[] = [
  { id: 'fire', name: '烈焰', desc: '锥形火焰 + 火星，循环燃烧', tag: '火焰', accent: '#ff7a1a', build: buildFire },
  { id: 'jet', name: '烈焰喷射', desc: '定向火舌 + 尾焰烟，持续喷射', tag: '火焰', accent: '#ffa53a', build: buildJet },
  { id: 'fireball', name: '火球术', desc: '飞行火球 + 拖尾 + 命中冲击环', tag: '火焰', accent: '#ff8f2e', build: buildFireball },
  { id: 'wave', name: '火焰冲击波', desc: '地面环形火墙扩散 + 飞溅火星', tag: '火焰', accent: '#ff9030', build: buildWave },
  { id: 'firestorm', name: '烈焰风暴', desc: '旋转上升的火龙卷 + 顶部火冠', tag: '火焰', accent: '#ff6b20', build: buildFirestorm },
  { id: 'lava', name: '岩浆喷发', desc: '熔岩池 + 火山口 + 喷柱与熔滴', tag: '火焰', accent: '#ff5214', build: buildLava },
  { id: 'burning', name: '灼烧地面', desc: '焦土上多点火苗 + 升腾余烬', tag: '火焰', accent: '#ff7a28', build: buildBurning },
  { id: 'aura', name: '火焰护体', desc: '环绕火环 + 脚下火圈 + 火星', tag: '火焰', accent: '#ffb13a', build: buildAura },
  { id: 'breath', name: '龙息', desc: '宽扇形火流 + 烟浪，持续喷吐', tag: '火焰', accent: '#ff9a2e', build: buildBreath },
  { id: 'ember', name: '灰烬爆破', desc: '余烬爆散 + 飘落灰烬 + 冲击环', tag: '火焰', accent: '#ffc04a', build: buildEmber },
  { id: 'flameslash', name: '火刃斩', desc: '弧形火刃 + 速度拉伸火星', tag: '火焰', accent: '#ffae3a', build: buildFlameSlash },
  { id: 'frost', name: '冰霜新星', desc: '霜爆环 + 冰棱飞散 + 冰晶簇', tag: '元素', accent: '#9fe9ff', build: buildFrost },
  { id: 'lightning', name: '雷电冲击', desc: '闪烁电弧 + 落点爆裂', tag: '元素', accent: '#67b6ff', build: buildLightning },
  { id: 'meteor', name: '陨石坠落', desc: '带火尾的落石 + 撞击冲击环', tag: '元素', accent: '#ff8a3a', build: buildMeteor },
  { id: 'poison', name: '剧毒领域', desc: '毒泡上浮 + 毒云 + 孢子飞散', tag: '元素', accent: '#8bff4a', build: buildPoison },
  { id: 'explosion', name: '冲击爆炸', desc: '一次性爆发：火花 + 烟云 + 冲击环', tag: '战斗', accent: '#ffc23d', build: buildExplosion },
  { id: 'slash', name: '斩击刀光', desc: '弧形刀光 + 速度拉伸火花', tag: '战斗', accent: '#7fe0ff', build: buildSlash },
  { id: 'magic', name: '奥术法阵', desc: '双层符文盘 + 光柱 + 微粒', tag: '法术', accent: '#5f9bff', build: buildMagic },
  { id: 'shield', name: '圣光护盾', desc: '球形护盾 + 内核网格 + 圣光粒', tag: '法术', accent: '#ffd977', build: buildShield },
  { id: 'shadow', name: '暗影侵蚀', desc: '缠绕核心 + 黑雾 + 暗影碎片', tag: '法术', accent: '#a06bff', build: buildShadow },
  { id: 'portal', name: '虚空裂隙', desc: '旋转裂隙 + 虚空核 + 螺旋微粒', tag: '法术', accent: '#c86bff', build: buildPortal },
  { id: 'heal', name: '治疗光环', desc: '上升光点 + 叶影，绿色循环', tag: '法术', accent: '#41ff9e', build: buildHeal },
  { id: 'shatter', name: '冰晶碎裂', desc: '实体冰晶爆散 + 落地弹跳 + 冷光闪爆', tag: '元素', accent: '#8fe0ff', build: buildShatter },
  { id: 'subemit', name: '子发射演示', desc: '触地溅射 + 寿命碎裂，验证子发射与生命曲线', tag: '演示', accent: '#ff9a3c', build: buildSubEmit },
  { id: 'burst', name: '冲击爆点', desc: '序列帧爆闪 + 带地面反弹的碎石飞溅', tag: '演示', accent: '#ffb545', build: buildBurst }
]
