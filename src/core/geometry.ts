import * as THREE from 'three'
import type { GeoKind, GeoParams } from './types'

export const GEO_LIST: Array<{ kind: GeoKind; label: string; hint: string }> = [
  { kind: 'box', label: '立方体', hint: '方块 / 体积块' },
  { kind: 'sphere', label: '球体', hint: '光球 / 冲击球' },
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
  return `${kind}|${p.size}|${p.radius}|${p.tube}|${p.segments}|${p.rings}|${p.thickness}|${p.angle}|${p.detail}|${p.deform}|${p.seed}`
}

export function buildGeometry(kind: GeoKind, p: GeoParams): THREE.BufferGeometry {
  const seg = Math.max(3, Math.round(p.segments))
  const rings = Math.max(2, Math.round(p.rings))
  switch (kind) {
    case 'box':
      return new THREE.BoxGeometry(p.size, p.size, p.size, 1, 1, 1)
    case 'sphere':
      return new THREE.SphereGeometry(p.radius, seg, rings)
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(p.radius, Math.max(0, Math.round(p.detail)))
    case 'torus':
      return new THREE.TorusGeometry(p.radius, p.tube, rings, seg)
    case 'torusKnot':
      return new THREE.TorusKnotGeometry(p.radius, p.tube, seg, rings, 2, 3)
    case 'cone':
      return new THREE.ConeGeometry(p.radius, p.size || 1, seg)
    case 'cylinder':
      return new THREE.CylinderGeometry(p.radius, p.radius, p.size || 1, seg, 1)
    case 'capsule':
      return new THREE.CapsuleGeometry(p.radius, Math.max(0.01, (p.size || 1) - p.radius * 2), 8, seg)
    case 'plane':
      return new THREE.PlaneGeometry(p.size, p.size)
    case 'ring':
      return new THREE.RingGeometry(
        Math.max(0.001, p.radius - p.thickness / 2),
        p.radius + p.thickness / 2,
        seg,
        Math.max(1, Math.round(seg / 8))
      )
    case 'arc': {
      const theta = THREE.MathUtils.degToRad(Math.min(359, Math.max(2, p.angle)))
      return new THREE.RingGeometry(
        Math.max(0.001, p.radius - p.thickness / 2),
        p.radius + p.thickness / 2,
        seg,
        4,
        Math.PI / 2 - theta / 2,
        theta
      )
    }
    case 'disc':
      return new THREE.CircleGeometry(p.radius, seg)
    case 'crystal':
      return deformGeometry(new THREE.IcosahedronGeometry(p.radius, Math.max(0, Math.round(p.detail))), p.deform, p.seed, p.detail)
    case 'rock':
      return deformGeometry(new THREE.IcosahedronGeometry(p.radius, Math.max(1, Math.round(p.detail))), p.deform, p.seed * 7.3, p.detail)
    default:
      return new THREE.BoxGeometry(1, 1, 1)
  }
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
