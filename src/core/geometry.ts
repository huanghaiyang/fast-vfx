import * as THREE from 'three'
import type { GeoKind, GeoParams } from './types'

export const GEO_LIST: Array<{ kind: GeoKind; label: string; hint: string }> = [
  { kind: 'box', label: '立方体', hint: '方块 / 体积块' },
  { kind: 'sphere', label: '球体', hint: '光球 / 冲击球 / 岩石球' },
  { kind: 'icosahedron', label: '多面体', hint: '低模球 / 能量核' },
  { kind: 'torus', label: '圆环', hint: '光环 / 轨迹' },
  { kind: 'torusKnot', label: '纽结', hint: '魔法缠绕' },
  { kind: 'cone', label: '圆锥', hint: '光束 / 尖刺' },
  { kind: 'cylinder', label: '圆柱', hint: '光柱 / 冲击柱' },
  { kind: 'capsule', label: '胶囊', hint: '拖尾 / 波束' },
  { kind: 'plane', label: '平面', hint: '贴图面片 / 公告板' },
  { kind: 'ring', label: '圆环面片', hint: '地裂 / 光环面片' },
  { kind: 'disc', label: '圆盘', hint: '法阵底图' },
  { kind: 'arc', label: '弧形刀光', hint: '斩击 / 剑气' },
  { kind: 'crystal', label: '晶体', hint: '破碎水晶' },
  { kind: 'rock', label: '岩石', hint: '碎石 / 地刺' }
]

/** 每种几何体都支持的 8 个变种（0 = 原始形状） */
export const MODEL_VARIANTS: Array<{ id: number; name: string; hint: string }> = [
  { id: 0, name: '原始', hint: '未变形的基础形状' },
  { id: 1, name: '岩石', hint: '硬棱噪声：碎石、岩块' },
  { id: 2, name: '坑洼', hint: '随机陨坑，表面被砸出凹陷' },
  { id: 3, name: '鼓包', hint: '低频鼓起：熔岩、肉块、气泡' },
  { id: 4, name: '尖刺', hint: '高频尖刺：冰棱、尖刺球' },
  { id: 5, name: '环纹', hint: '沿轴波纹：熔岩涌浪、层积岩' },
  { id: 6, name: '扭曲', hint: '沿轴扭转：藤蔓、漩涡、被拧过的金属' },
  { id: 7, name: '棱面', hint: '顶点量化成低模棱面块' },
  { id: 8, name: '抻长', hint: '各向异性拉长 + 噪声，陨石/子弹' }
]

function noiseAt(x: number, y: number, z: number, seed: number): number {
  return (
    Math.sin(x * 2.1 + seed) * Math.cos(y * 2.7 + seed * 1.3) * Math.sin(z * 1.9 + seed * 0.7) +
    0.45 * Math.sin(x * 5.3 + z * 4.1 + seed * 2.1) +
    0.25 * Math.sin(y * 8.7 + x * 6.2 + seed * 3.3)
  )
}

function hash01(i: number, seed: number): number {
  const h = Math.sin((i + 1) * 127.1 + seed * 311.7) * 43758.5453
  return h - Math.floor(h)
}

/** 把变种位移作用到已有几何体（会自动加细分，否则位移看不出来） */
function applyVariant(geo: THREE.BufferGeometry, variant: number, p: GeoParams) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const seed = p.seed ?? 1
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()

  // 陨坑：随机方向 + 半径 + 深度
  const craters = [] as Array<{ d: THREE.Vector3; r: number; depth: number }>
  if (variant === 2) {
    const count = 6 + Math.floor(hash01(1, seed) * 6)
    for (let i = 0; i < count; i++) {
      const th = hash01(i * 3 + 1, seed) * Math.PI * 2
      const ph = Math.acos(hash01(i * 3 + 2, seed) * 2 - 1)
      const d = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th))
      craters.push({ d, r: 0.22 + hash01(i * 3 + 3, seed) * 0.42, depth: 0.35 + hash01(i * 5 + 4, seed) * 0.55 })
    }
  }

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const len = v.length() || 1
    n.copy(v).divideScalar(len)

    switch (variant) {
      case 1: {
        // 岩石：硬棱噪声，用 |n| 造出棱线而不是圆滑起伏
        const k = noiseAt(v.x * 1.6, v.y * 1.6, v.z * 1.6, seed)
        const ridge = 1 - Math.abs(k)
        v.multiplyScalar(1 + Math.sign(k) * ridge * 0.28)
        break
      }
      case 2: {
        // 坑洼：沿法线方向挖掉球冠
        let dent = 0
        for (const c of craters) {
          const ang = Math.acos(Math.max(-1, Math.min(1, n.dot(c.d))))
          const g = Math.exp(-(ang * ang) / (c.r * c.r))
          dent = Math.max(dent, g * c.depth)
        }
        v.multiplyScalar(1 - dent * 0.55)
        break
      }
      case 3: {
        // 鼓包：低频起伏，体积感被推挤
        const k = Math.sin(v.x * 1.5 + seed) * Math.cos(v.y * 1.2 + seed) + 0.6 * Math.sin(v.z * 2.4 + seed * 2)
        v.multiplyScalar(1 + k * 0.18)
        break
      }
      case 4: {
        // 尖刺：只把最高频的正向极值放大成刺
        const k = noiseAt(v.x * 4.2, v.y * 4.2, v.z * 4.2, seed * 3)
        const spike = Math.pow(Math.max(0, k), 4)
        v.multiplyScalar(1 + spike * 0.9)
        break
      }
      case 5: {
        // 环纹：沿 Y 轴的层积波纹
        const ring = Math.sin(v.y * 16 + seed * 2)
        v.multiplyScalar(1 + ring * 0.06)
        v.y += ring * 0.02
        break
      }
      case 6: {
        // 扭曲：角度随高度（扁平件随径向）增加
        const ang = (v.y * 1.1 + v.x * 0.5) * 0.9
        const ca = Math.cos(ang)
        const sa = Math.sin(ang)
        const x = v.x * ca - v.z * sa
        const z = v.x * sa + v.z * ca
        v.set(x, v.y, z)
        break
      }
      case 7: {
        // 棱面：顶点吸附到粗网格，形成低模块面
        const step = 0.14
        v.set(Math.round(v.x / step) * step, Math.round(v.y / step) * step, Math.round(v.z / step) * step)
        break
      }
      case 8: {
        // 抻长：单向拉长 + 轻微噪声
        const k = noiseAt(v.x * 3, v.y * 3, v.z * 3, seed * 5)
        v.set(v.x * 0.78 * (1 + k * 0.12), v.y * 0.78 * (1 + k * 0.12), v.z * 2.1 * (1 + k * 0.2))
        break
      }
      default:
        break
    }
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

function deformGeometry(geo: THREE.BufferGeometry, amount: number, seed: number, detail: number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n =
      Math.sin(v.x * 2.1 + seed) * Math.cos(v.y * 2.7 + seed * 1.3) * Math.sin(v.z * 1.9 + seed * 0.7) +
      0.4 * Math.sin(v.x * 5.3 + v.z * 4.1 + seed)
    const scale = 1 + n * amount
    v.multiplyScalar(scale)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

export function geometryKey(kind: GeoKind, p: GeoParams): string {
  return `${kind}|${p.size}|${p.radius}|${p.tube}|${p.segments}|${p.rings}|${p.thickness}|${p.angle}|${p.detail}|${p.deform}|${p.seed}|${p.variant ?? 0}`
}

export function buildGeometry(kind: GeoKind, p: GeoParams): THREE.BufferGeometry {
  const variant = p.variant ?? 0
  // 变种要位移顶点，基础形状得先有足够细分，否则看不出形变
  const sub = variant ? 3 : 1
  const seg = Math.max(3, Math.round(p.segments))
  const rings = Math.max(2, Math.round(p.rings))
  let geo: THREE.BufferGeometry
  switch (kind) {
    case 'box':
      geo = new THREE.BoxGeometry(p.size, p.size, p.size, sub * 2, sub * 2, sub * 2)
      break
    case 'sphere':
      geo = new THREE.SphereGeometry(p.radius, seg, rings)
      break
    case 'icosahedron':
      geo = new THREE.IcosahedronGeometry(p.radius, Math.max(0, Math.round(p.detail)))
      break
    case 'torus':
      geo = new THREE.TorusGeometry(p.radius, p.tube, rings, seg)
      break
    case 'torusKnot':
      geo = new THREE.TorusKnotGeometry(p.radius, p.tube, seg, rings, 2, 3)
      break
    case 'cone':
      geo = new THREE.ConeGeometry(p.radius, p.size || 1, seg, variant ? 6 : 1)
      break
    case 'cylinder':
      geo = new THREE.CylinderGeometry(p.radius, p.radius, p.size || 1, seg, variant ? 8 : 1)
      break
    case 'capsule':
      geo = new THREE.CapsuleGeometry(p.radius, Math.max(0.01, (p.size || 1) - p.radius * 2), 8, seg)
      break
    case 'plane':
      geo = new THREE.PlaneGeometry(p.size, p.size, variant ? 12 : 1, variant ? 12 : 1)
      break
    case 'ring':
      geo = new THREE.RingGeometry(
        Math.max(0.001, p.radius - p.thickness / 2),
        p.radius + p.thickness / 2,
        seg,
        variant ? 8 : Math.max(1, Math.round(seg / 8))
      )
      break
    case 'arc': {
      const theta = THREE.MathUtils.degToRad(Math.min(359, Math.max(2, p.angle)))
      geo = new THREE.RingGeometry(
        Math.max(0.001, p.radius - p.thickness / 2),
        p.radius + p.thickness / 2,
        seg,
        variant ? 8 : 4,
        Math.PI / 2 - theta / 2,
        theta
      )
      break
    }
    case 'disc':
      geo = new THREE.CircleGeometry(p.radius, seg)
      break
    case 'crystal':
      geo = deformGeometry(new THREE.IcosahedronGeometry(p.radius, Math.max(0, Math.round(p.detail))), p.deform, p.seed, p.detail)
      break
    case 'rock':
      geo = deformGeometry(new THREE.IcosahedronGeometry(p.radius, Math.max(1, Math.round(p.detail))), p.deform, p.seed * 7.3, p.detail)
      break
    default:
      geo = new THREE.BoxGeometry(1, 1, 1)
  }
  return variant ? applyVariant(geo, variant, p) : geo
}

/** Godot 内置图元兜底映射（GLB 导入失败时使用） */
export function godotPrimitive(kind: GeoKind, p: GeoParams): { mesh: string; args: Record<string, unknown> } {
  switch (kind) {
    case 'box':
      return { mesh: 'BoxMesh', args: { size: [p.size, p.size, p.size] } }
    case 'sphere':
      return { mesh: 'SphereMesh', args: { radius: p.radius, height: p.radius * 2, radial_segments: p.segments, rings: p.rings } }
    case 'icosahedron':
    case 'crystal':
    case 'rock':
      return { mesh: 'SphereMesh', args: { radius: p.radius, height: p.radius * 2, radial_segments: 12, rings: 8 } }
    case 'torus':
      return { mesh: 'TorusMesh', args: { inner_radius: p.radius - p.tube, outer_radius: p.radius + p.tube, rings: p.segments, ring_segments: p.rings } }
    case 'torusKnot':
      return { mesh: 'TorusMesh', args: { inner_radius: p.radius * 0.5, outer_radius: p.radius, rings: p.segments, ring_segments: p.rings } }
    case 'cone':
      return { mesh: 'CylinderMesh', args: { top_radius: 0, bottom_radius: p.radius, height: p.size, radial_segments: p.segments } }
    case 'cylinder':
      return { mesh: 'CylinderMesh', args: { top_radius: p.radius, bottom_radius: p.radius, height: p.size, radial_segments: p.segments } }
    case 'capsule':
      return { mesh: 'CapsuleMesh', args: { radius: p.radius, height: p.size } }
    case 'plane':
      return { mesh: 'PlaneMesh', args: { size: [p.size, p.size] } }
    case 'disc':
      return { mesh: 'CylinderMesh', args: { top_radius: p.radius, bottom_radius: p.radius, height: 0.01, radial_segments: p.segments } }
    case 'ring':
    case 'arc':
      return { mesh: 'TorusMesh', args: { inner_radius: p.radius - p.thickness / 2, outer_radius: p.radius + p.thickness / 2, rings: p.segments, ring_segments: 6 } }
    default:
      return { mesh: 'BoxMesh', args: { size: [1, 1, 1] } }
  }
}

export const DOUBLE_SIDED_KINDS: GeoKind[] = ['plane', 'ring', 'disc', 'arc', 'leaf' as GeoKind]
