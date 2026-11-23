import * as THREE from 'three'
import type { MeshParticleGeo, ParticleDoc, ShapeKind, TextureAsset } from './types'
import { buildCurveLUT, buildGradientLUT, clamp, lerp } from './curve'
import { getTexture } from './textures'

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iColor;
attribute float iSize;
attribute float iRot;
attribute float iStretch;
attribute float iSeed;
attribute float iProg;

uniform float uAlign;
uniform float uAxis;
uniform float uFlipV;
uniform float uFlipCols;
uniform float uFlipRows;
uniform float uFlipMode;
uniform float uFlipFps;
uniform float uTime;

varying vec4 vColor;
varying vec2 vTexUv;
varying vec2 vLocal;
varying float vSeed;
varying float vProg;

void main() {
  vLocal = uv;
  vColor = iColor;
  vSeed = iSeed;
  vProg = iProg;

  // 每颗粒子随机镜像 UV；序列帧整图翻转会把格子拼错，必须禁用
  float mirror = uFlipCols > 0.5 ? 0.0 : 1.0;
  float sx = mod(floor(iSeed * 7.0), 2.0) * mirror;
  float sy = mod(floor(iSeed * 13.0), 2.0) * uFlipV * mirror;
  vec2 muv = vec2(sx > 0.5 ? 1.0 - uv.x : uv.x, sy > 0.5 ? 1.0 - uv.y : uv.y);

  if (uFlipCols > 0.5) {
    float total = uFlipCols * uFlipRows;
    float idx = uFlipMode > 0.5 ? mod(floor(uTime * uFlipFps), total) : min(total - 1.0, floor(iProg * total));
    float cu = mod(idx, uFlipCols);
    float cv = floor(idx / uFlipCols);
    vTexUv = vec2((cu + muv.x) / uFlipCols, (cv + muv.y) / uFlipRows);
  } else {
    vTexUv = muv;
  }

  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);

  float ang = iRot;
  // 竖向贴图（火焰 / 光束）不参与自由旋转，否则朝向速度方向时会被翻 180°
  if (uAxis > 0.5) ang = 0.0;
  if (uAlign > 0.001) {
    vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
    if (length(vv.xy) > 1e-5) {
      // uAxis=1: 贴图 +Y 沿速度；否则 +X 沿速度（横向拖尾贴图）
      float target = uAxis > 0.5 ? atan(-vv.x, vv.y) : atan(vv.y, vv.x) - 1.5707963;
      ang = mix(ang, target, uAlign);
      // 对齐后再抖一点，避免所有粒子朝向完全一致而显出贴图重复
      ang += (iSeed - 0.5) * (uAxis > 0.5 ? 0.34 : 0.5);
    }
  }

  vec2 q = position.xy;
  q.y *= (1.0 + iStretch);

  float s = sin(ang);
  float c = cos(ang);
  vec2 rq = vec2(q.x * c - q.y * s, q.x * s + q.y * c);

  mv.xy += rq * iSize;
  // 竖向贴图往生长方向偏一点，火舌从粒子位置向上窜，避免上下对称堆成一团
  if (uAxis > 0.5) {
    float lift = 0.34 * (1.0 + iStretch) * iSize;
    mv.xy += vec2(-s, c) * lift;
  }
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
uniform float uTime;
uniform float uHot;
uniform float uFlicker;
uniform float uAxis;

varying vec4 vColor;
varying vec2 vTexUv;
varying vec2 vLocal;
varying float vSeed;
varying float vProg;

void main() {
  vec4 t = texture2D(uMap, vTexUv);

  // 边缘羽化，去掉贴片方角
  vec2 p = vLocal - 0.5;
  float r = length(p) * 2.0;
  float feather = 1.0 - smoothstep(0.9, 1.0, r);

  // 火焰抖动：低频亮度起伏
  float flick = mix(1.0, 0.84 + 0.16 * sin(uTime * 7.3 + vSeed * 24.0), uFlicker);

  float a = t.a * vColor.a * uOpacity * feather * flick;
  // 竖向贴图软化根部，防止所有火舌底边对齐后拉出一条亮线
  if (uAxis > 0.5) a *= smoothstep(0.0, 0.22, vLocal.y);
  if (a <= 0.004) discard;

  // 白热核心：只让最密的中心过曝，其余保持彩色
  float core = pow(clamp(t.a, 0.0, 1.0), 4.0);
  vec3 rgb = t.rgb * vColor.rgb * (1.0 + uHot * core * 1.6) + vec3(uHot * core * 0.25);

  gl_FragColor = vec4(rgb, a);
}
`

const UP = new THREE.Vector3(0, 1, 0)

export class ParticleSystem {
  readonly mesh: THREE.Mesh
  /** 外壳：同时装 billboard 贴片与实例化实体几何，引擎只挂这个 */
  readonly root = new THREE.Group()
  private inst?: THREE.InstancedMesh
  private instKey = ''
  private instMat = new THREE.MeshStandardMaterial({
    // 颜色完全来自 InstancedMesh.instanceColor；打开 vertexColors 会因几何体没有 color 属性而走错分支
    vertexColors: false,
    metalness: 0.1,
    roughness: 0.8,
    emissive: new THREE.Color(0x0d0502),
    emissiveIntensity: 0.2,
    flatShading: true
  })
  private dummy = new THREE.Object3D()
  private tmpColor = new THREE.Color()

  private geo: THREE.InstancedBufferGeometry
  private mat: THREE.ShaderMaterial
  private attrs: {
    pos: THREE.InstancedBufferAttribute
    vel: THREE.InstancedBufferAttribute
    color: THREE.InstancedBufferAttribute
    size: THREE.InstancedBufferAttribute
    rot: THREE.InstancedBufferAttribute
    stretch: THREE.InstancedBufferAttribute
    seed: THREE.InstancedBufferAttribute
    prog: THREE.InstancedBufferAttribute
  }
  private max = 1
  private count = 0

  // 每颗粒子状态
  private px = new Float32Array(1)
  private py = new Float32Array(1)
  private pz = new Float32Array(1)
  private vx = new Float32Array(1)
  private vy = new Float32Array(1)
  private vz = new Float32Array(1)
  private age = new Float32Array(1)
  private life = new Float32Array(1)
  private angle = new Float32Array(1)
  private angVel = new Float32Array(1)
  private seed = new Float32Array(1)

  private rateAcc = 0
  private burstTimer = 0
  private emitElapsed = 0
  private emitStarted = false

  private curveLUT: Float32Array = new Float32Array(64)
  private speedLUT: Float32Array = new Float32Array(64)
  private spinLUT: Float32Array = new Float32Array(64)
  private colorLUT: Float32Array = new Float32Array(64 * 4)
  private lutKey = ''

  /** 子发射回调：父粒子消亡/触地时把位置、速度与事件时间交给引擎路由 */
  onSpawn:
    | ((x: number, y: number, z: number, vx: number, vy: number, vz: number, at: number, spread: number) => void)
    | null = null
  /** 外部注入队列（子发射写入，下一次 simulate 消化；at 早于当前时间的才注入） */
  private inject: Array<{
    x: number
    y: number
    z: number
    vx: number
    vy: number
    vz: number
    spread: number
    at: number
  }> = []

  /** 固定种子的伪随机：暂停后重新 seek 必须复现同一帧，否则切个开关画面就换样 */
  private randState = 0x9e3779b9

  private seedRand(key: string) {
    let h = 2166136261
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    this.randState = (h >>> 0) || 0x9e3779b9
  }

  /** xorshift32，约 1e-9 的周期误差，对粒子抖动完全够用 */
  private rand() {
    let x = this.randState
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    this.randState = x
    return x / 4294967296
  }

  doc: ParticleDoc
  texture: THREE.Texture

  /** 时间轴关键帧驱动的运行时覆盖（不改动 doc 本身） */
  overrides: { radius: number | null; clusters: number | null; size: number | null } = {
    radius: null,
    clusters: null,
    size: null
  }
  private clusterPos: Array<[number, number, number]> = [[0, 0, 0]]
  private clusterKey = ''

  constructor(doc: ParticleDoc, textures: TextureAsset[]) {
    this.doc = doc
    this.geo = this.buildGeometry(4)
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uMap: { value: getTexture(undefined) },
        uOpacity: { value: 1 },
        uAlign: { value: 0 },
        uTime: { value: 0 },
        uHot: { value: 0.45 },
        uFlicker: { value: 0.8 },
        uAxis: { value: 0 },
        uFlipV: { value: 1 },
        uFlipCols: { value: 0 },
        uFlipRows: { value: 1 },
        uFlipMode: { value: 0 },
        uFlipFps: { value: 20 }
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    })
    this.mesh = new THREE.Mesh(this.geo, this.mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.visible = doc.visible
    // 拾取交给发射器的代理球，粒子网格不参与射线检测
    this.mesh.raycast = () => {}
    this.root.add(this.mesh)
    this.root.frustumCulled = false
    this.attrs = {
      pos: this.geo.getAttribute('iPos') as THREE.InstancedBufferAttribute,
      vel: this.geo.getAttribute('iVel') as THREE.InstancedBufferAttribute,
      color: this.geo.getAttribute('iColor') as THREE.InstancedBufferAttribute,
      size: this.geo.getAttribute('iSize') as THREE.InstancedBufferAttribute,
      rot: this.geo.getAttribute('iRot') as THREE.InstancedBufferAttribute,
      stretch: this.geo.getAttribute('iStretch') as THREE.InstancedBufferAttribute,
      seed: this.geo.getAttribute('iSeed') as THREE.InstancedBufferAttribute,
      prog: this.geo.getAttribute('iProg') as THREE.InstancedBufferAttribute
    }
    this.texture = getTexture(this.findTexture(textures))
    this.mat.uniforms.uMap.value = this.texture
    this.setMax(doc.render.maxCount)
    this.seedRand(doc.name)
    this.applySettings(textures)
  }

  private findTexture(textures: TextureAsset[]) {
    return textures.find((t) => t.id === this.doc.render.textureId)
  }

  /** 实体粒子：每帧写实例矩阵与颜色（alpha 折进颜色，近似的透明衰减） */
  private flushInst(n: number, col: Float32Array, siz: Float32Array) {
    const inst = this.inst
    if (!inst) return
    const d = this.dummy
    for (let i = 0; i < n; i++) {
      const s = Math.max(0.001, siz[i] * 1.15)
      d.position.set(this.px[i], this.py[i], this.pz[i])
      const a = this.angle[i]
      const sd = this.seed[i]
      // 两个附加轴让碎片翻滚，而不是像纸片一样只绕 Z 转
      d.rotation.set(a * 1.2 + sd * 6.283, a * 0.75 + sd * 4.1, a)
      d.scale.setScalar(s)
      d.updateMatrix()
      inst.setMatrixAt(i, d.matrix)
      const alpha = Math.min(1, col[i * 4 + 3])
      const tint = 0.95 * (0.45 + 0.55 * alpha)
      // 实体走光照材质，颜色按 0..1 归一，避免亮部全部过曝成白块
      this.tmpColor.setRGB(
        Math.min(1, col[i * 4] * tint),
        Math.min(1, col[i * 4 + 1] * tint),
        Math.min(1, col[i * 4 + 2] * tint)
      )
      inst.setColorAt(i, this.tmpColor)
    }
    inst.count = n
    inst.instanceMatrix.needsUpdate = true
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
  }

  /** 实体粒子的几何：碎片/方块/晶体/碎石 */
  private meshGeometry(kind: MeshParticleGeo): THREE.BufferGeometry {
    switch (kind) {
      case 'box':
        return new THREE.BoxGeometry(0.7, 0.7, 0.7, 1, 1, 1)
      case 'crystal':
        return new THREE.OctahedronGeometry(0.62, 0)
      case 'rock':
        return new THREE.DodecahedronGeometry(0.6, 0)
      default:
        return new THREE.TetrahedronGeometry(0.62, 0)
    }
  }

  /** 按需创建/重建实例化实体几何（数量或形状变了就重建） */
  private ensureInst() {
    const key = `${this.doc.render.meshGeo || 'shard'}|${this.max}`
    if (this.inst && this.instKey === key) return
    if (this.inst) {
      this.root.remove(this.inst)
      this.inst.geometry.dispose()
      this.inst.dispose()
      this.inst = undefined
    }
    const mesh = new THREE.InstancedMesh(this.meshGeometry(this.doc.render.meshGeo || 'shard'), this.instMat, this.max)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.count = 0
    mesh.raycast = () => {}
    mesh.castShadow = false
    mesh.renderOrder = 3
    this.inst = mesh
    this.instKey = key
    this.root.add(mesh)
  }

  private buildGeometry(max: number): THREE.InstancedBufferGeometry {
    const base = new THREE.PlaneGeometry(1, 1)
    const geo = new THREE.InstancedBufferGeometry()
    geo.setIndex(base.getIndex())
    geo.setAttribute('position', base.getAttribute('position'))
    geo.setAttribute('uv', base.getAttribute('uv'))
    geo.setAttribute('normal', base.getAttribute('normal'))
    const make = (n: number, size: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size)
      a.setUsage(THREE.DynamicDrawUsage)
      return a
    }
    geo.setAttribute('iPos', make(max, 3))
    geo.setAttribute('iVel', make(max, 3))
    geo.setAttribute('iColor', make(max, 4))
    geo.setAttribute('iSize', make(max, 1))
    geo.setAttribute('iRot', make(max, 1))
    geo.setAttribute('iStretch', make(max, 1))
    geo.setAttribute('iSeed', make(max, 1))
    geo.setAttribute('iProg', make(max, 1))
    geo.instanceCount = 0
    return geo
  }

  setMax(max: number) {    max = Math.round(clamp(max, 1, 20000))
    if (max === this.max && this.count >= 0 && this.px.length === max) return
    this.max = max
    this.count = 0
    const arr = (n: number) => new Float32Array(n)
    this.px = arr(max)
    this.py = arr(max)
    this.pz = arr(max)
    this.vx = arr(max)
    this.vy = arr(max)
    this.vz = arr(max)
    this.age = arr(max)
    this.life = arr(max)
    this.angle = arr(max)
    this.angVel = arr(max)
    this.seed = arr(max)
    const old = this.geo
    const base = new THREE.PlaneGeometry(1, 1)
    const geo = new THREE.InstancedBufferGeometry()
    geo.setIndex(base.getIndex())
    geo.setAttribute('position', base.getAttribute('position'))
    geo.setAttribute('uv', base.getAttribute('uv'))
    geo.setAttribute('normal', base.getAttribute('normal'))
    const make = (n: number, size: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size)
      a.setUsage(THREE.DynamicDrawUsage)
      return a
    }
    geo.setAttribute('iPos', make(max, 3))
    geo.setAttribute('iVel', make(max, 3))
    geo.setAttribute('iColor', make(max, 4))
    geo.setAttribute('iSize', make(max, 1))
    geo.setAttribute('iRot', make(max, 1))
    geo.setAttribute('iStretch', make(max, 1))
    geo.setAttribute('iSeed', make(max, 1))
    geo.setAttribute('iProg', make(max, 1))
    geo.instanceCount = 0
    this.geo = geo
    this.mesh.geometry = geo
    this.attrs = {
      pos: geo.getAttribute('iPos') as THREE.InstancedBufferAttribute,
      vel: geo.getAttribute('iVel') as THREE.InstancedBufferAttribute,
      color: geo.getAttribute('iColor') as THREE.InstancedBufferAttribute,
      size: geo.getAttribute('iSize') as THREE.InstancedBufferAttribute,
      rot: geo.getAttribute('iRot') as THREE.InstancedBufferAttribute,
      stretch: geo.getAttribute('iStretch') as THREE.InstancedBufferAttribute,
      seed: geo.getAttribute('iSeed') as THREE.InstancedBufferAttribute,
      prog: geo.getAttribute('iProg') as THREE.InstancedBufferAttribute
    }
    old.dispose()
    this.lutKey = ''
  }

  private clusterCount() {
    const n = this.overrides.clusters ?? this.doc.clusters ?? 1
    return Math.max(1, Math.min(12, Math.round(n)))
  }

  /** 簇的分布中心：多簇时落在一条错落圆环上，单簇就是原点 */
  private ensureClusters() {
    const n = this.clusterCount()
    const rad = Math.max(0, this.doc.clusterRadius ?? 0)
    const key = `${n}|${rad.toFixed(3)}`
    if (key === this.clusterKey) return
    this.clusterKey = key
    const out: Array<[number, number, number]> = []
    for (let i = 0; i < n; i++) {
      if (n === 1) {
        out.push([0, 0, 0])
        continue
      }
      const a = (i / n) * Math.PI * 2 + 0.55
      const r = rad * (0.58 + 0.42 * (i % 2 === 0 ? 1 : 0.72))
      out.push([Math.cos(a) * r, 0.02 * (i % 2), Math.sin(a) * r])
    }
    this.clusterPos = out
  }

  applySettings(textures: TextureAsset[]) {
    const r = this.doc.render
    this.mesh.visible = this.doc.visible
    this.mat.uniforms.uOpacity.value = r.opacity
    this.mat.uniforms.uAlign.value = this.doc.spin.align
    switch (r.blend) {
      case 'alpha':
        this.mat.blending = THREE.NormalBlending
        this.mat.uniforms.uHot.value = 0
        this.mat.uniforms.uFlicker.value = 0.35
        break
      case 'multiply':
        this.mat.blending = THREE.MultiplyBlending
        this.mat.uniforms.uHot.value = 0
        this.mat.uniforms.uFlicker.value = 0
        break
      default:
        this.mat.blending = THREE.AdditiveBlending
        this.mat.uniforms.uHot.value = 0.16
        this.mat.uniforms.uFlicker.value = 0.8
    }
    const asset = this.findTexture(textures)
    // 竖向有方向性的贴图：+Y 沿速度对齐，且不做纵向镜像（否则火焰会上下颠倒）
    const gen = asset?.gen || ''
    const vertical = gen === 'flame' || gen === 'beam'
    this.mat.uniforms.uAxis.value = vertical ? 1 : 0
    this.mat.uniforms.uFlipV.value = vertical ? 0 : 1
    // 烟雾层不该有白热核，否则大团粒子会整片过曝
    const hot = r.textureId === 'tex_smoke' ? 0.05 : 0.18
    if (this.mat.blending === THREE.AdditiveBlending) this.mat.uniforms.uHot.value = hot
    const tex = getTexture(asset)
    if (tex !== this.texture) {
      this.texture = tex
      this.mat.uniforms.uMap.value = tex
    }
    this.root.visible = this.doc.visible
    if (r.maxCount !== this.max) this.setMax(r.maxCount)
    // 实体几何模式：贴片隐藏，实例化几何接管
    const meshMode = r.mode === 'mesh'
    this.mesh.visible = !meshMode
    if (meshMode) {
      this.ensureInst()
      if (this.inst) this.inst.visible = true
      this.instMat.blending = r.blend === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending
      this.instMat.transparent = r.blend === 'additive'
      this.instMat.opacity = r.opacity
      this.instMat.needsUpdate = true
    } else if (this.inst) {
      this.inst.visible = false
    }
    // 序列帧：只有开了 flipbook 且贴图确实是图集时才按格子采样
    const fb = r.flipbook
    const fbOn = !!fb?.enabled
    this.mat.uniforms.uFlipCols.value = fbOn ? Math.max(1, Math.round(fb!.cols)) : 0
    this.mat.uniforms.uFlipRows.value = fbOn ? Math.max(1, Math.round(fb!.rows)) : 1
    this.mat.uniforms.uFlipMode.value = fbOn && !fb!.holdLast ? 1 : 0
    this.mat.uniforms.uFlipFps.value = fbOn ? Math.max(1, fb!.fps) : 20

    const key = JSON.stringify([
      this.doc.sizeCurve,
      this.doc.speedCurve,
      this.doc.spinCurve,
      this.doc.gradient
    ])
    if (key !== this.lutKey) {
      this.curveLUT = buildCurveLUT(this.doc.sizeCurve, 64)
      this.speedLUT = buildCurveLUT(this.doc.speedCurve, 64)
      this.spinLUT = buildCurveLUT(this.doc.spinCurve, 64)
      this.colorLUT = buildGradientLUT(this.doc.gradient, 64)
      this.lutKey = key
    }
  }

  reset() {
    this.count = 0
    this.geo.instanceCount = 0
    this.rateAcc = 0
    this.burstTimer = 0
    this.emitElapsed = 0
    this.emitStarted = false
    this.inject.length = 0
    this.seedRand(this.doc.name)
  }

  private sampleDir(base: THREE.Vector3, spreadDeg: number, out: THREE.Vector3) {
    const spread = THREE.MathUtils.degToRad(spreadDeg)
    if (spread <= 0.0001) {
      out.copy(base)
      return out
    }
    // 圆锥内均匀采样
    const cosT = lerp(Math.cos(spread), 1, this.rand())
    const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT))
    const phi = this.rand() * Math.PI * 2
    const t1 = new THREE.Vector3()
    const t2 = new THREE.Vector3()
    if (Math.abs(base.y) > 0.99) t1.set(1, 0, 0)
    else t1.crossVectors(base, UP).normalize()
    t2.crossVectors(base, t1).normalize()
    out
      .copy(base)
      .multiplyScalar(cosT)
      .addScaledVector(t1, Math.cos(phi) * sinT)
      .addScaledVector(t2, Math.sin(phi) * sinT)
      .normalize()
    return out
  }

  /** 由子发射器注入的粒子：直接落在给定位置，速度继承父粒子并随机扩散 */
  private emitInjected(p: { x: number; y: number; z: number; vx: number; vy: number; vz: number; spread: number }) {
    if (this.count >= this.max) return
    const e = this.doc.emission
    const m = this.motionOf()
    const s = this.doc.spin
    const i = this.count++
    const rnd = (a: number, b: number) => a + this.rand() * (b - a)

    const base = new THREE.Vector3(p.vx, p.vy, p.vz)
    if (base.lengthSq() < 1e-8) base.set(0, 1, 0)
    base.normalize()
    // 触地注入时父速度是朝下的，直接沿用会让子粒子下一秒就摔穿地面——统一反射成向上
    if (base.y < 0) base.y = Math.abs(base.y) * 0.7
    const dir = this.sampleDir(base, p.spread, new THREE.Vector3())
    const speed = rnd(m.speedMin, m.speedMax)

    this.px[i] = p.x
    this.py[i] = Math.max(0, p.y)
    this.pz[i] = p.z
    this.vx[i] = dir.x * speed
    this.vy[i] = dir.y * speed
    this.vz[i] = dir.z * speed
    this.age[i] = 0
    this.life[i] = Math.max(0.02, rnd(e.lifetimeMin, e.lifetimeMax))
    this.angle[i] = THREE.MathUtils.degToRad(rnd(s.angleMin, s.angleMax))
    this.angVel[i] = THREE.MathUtils.degToRad(rnd(s.speedMin, s.speedMax))
    this.seed[i] = this.rand()
  }

  private motionOf() {
    return this.doc.motion
  }

  /** 父系统调用：在一点注入一簇粒子（spread 为方向随机，度；at 为事件发生的时间点） */
  spawnBurst(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    count: number,
    spread: number,
    at = this.emitElapsed
  ) {
    for (let k = 0; k < count; k++) this.inject.push({ x, y, z, vx, vy, vz, spread, at })
  }

  private emitOne() {
    if (this.count >= this.max) return
    const e = this.doc.emission
    const m = this.doc.motion
    const s = this.doc.spin
    const i = this.count++

    this.ensureClusters()
    const cp = this.clusterPos[Math.floor(this.rand() * this.clusterPos.length)] || [0, 0, 0]
    const emitRadius = this.overrides.radius ?? e.radius

    const shape: ShapeKind = e.shape
    let ox = cp[0]
    let oy = cp[1]
    let oz = cp[2]
    let nx = 0
    let ny = 0
    let nz = 0

    const rnd = (a: number, b: number) => a + this.rand() * (b - a)

    switch (shape) {
      case 'sphere': {
        const u = this.rand()
        const v = this.rand()
        const theta = u * Math.PI * 2
        const phi = Math.acos(2 * v - 1)
        const rad = e.surface ? emitRadius : emitRadius * Math.cbrt(this.rand())
        nx = Math.sin(phi) * Math.cos(theta)
        ny = Math.cos(phi)
        nz = Math.sin(phi) * Math.sin(theta)
        ox += nx * rad
        oy += ny * rad
        oz += nz * rad
        break
      }
      case 'box':
        ox += rnd(-e.size[0] / 2, e.size[0] / 2)
        oy += rnd(-e.size[1] / 2, e.size[1] / 2)
        oz += rnd(-e.size[2] / 2, e.size[2] / 2)
        break
      case 'circle': {
        const a = this.rand() * Math.PI * 2
        const r = emitRadius * Math.sqrt(this.rand())
        ox += Math.cos(a) * r
        oz += Math.sin(a) * r
        break
      }
      case 'ring': {
        const a = this.rand() * Math.PI * 2
        const r = emitRadius + rnd(-0.06, 0.06) * emitRadius
        ox += Math.cos(a) * r
        oz += Math.sin(a) * r
        break
      }
      case 'cone': {
        const a = this.rand() * Math.PI * 2
        const r = emitRadius * Math.sqrt(this.rand())
        ox += Math.cos(a) * r
        oz += Math.sin(a) * r
        break
      }
      default:
        break
    }

    const base = new THREE.Vector3(m.direction[0], m.direction[1], m.direction[2])
    if (base.lengthSq() < 1e-8) base.set(0, 1, 0)
    base.normalize()

    const dir = new THREE.Vector3()
    if (shape === 'cone') {
      this.sampleDir(base, e.coneAngle, dir)
    } else if (shape === 'sphere' && !e.surface) {
      dir.set(nx, ny, nz).addScaledVector(base, 0.35).normalize()
      this.sampleDir(dir, m.spread, dir)
    } else {
      this.sampleDir(base, m.spread, dir)
    }

    const speed = rnd(m.speedMin, m.speedMax)
    this.px[i] = ox
    this.py[i] = oy
    this.pz[i] = oz
    this.vx[i] = dir.x * speed + nx * m.radial
    this.vy[i] = dir.y * speed + ny * m.radial
    this.vz[i] = dir.z * speed + nz * m.radial
    this.age[i] = 0
    this.life[i] = Math.max(0.02, rnd(e.lifetimeMin, e.lifetimeMax))
    this.angle[i] = THREE.MathUtils.degToRad(rnd(s.angleMin, s.angleMax))
    this.angVel[i] = THREE.MathUtils.degToRad(rnd(s.speedMin, s.speedMax))
    this.seed[i] = this.rand()
  }

  /** 只推进模拟，不写属性（预演/快进用） */
  simulate(dt: number) {
    const e = this.doc.emission
    const m = this.doc.motion

    if (!this.emitStarted) {
      this.emitStarted = true
      if (e.burst) {
        for (let k = 0; k < e.burstCount; k++) this.emitOne()
      }
      this.burstTimer = 0
    }

    this.emitElapsed += dt
    const emitting = e.duration <= 0 || this.emitElapsed < e.duration

    // 子发射注入（父粒子死亡/触地时压进来的）：只放行事件时间已到的，快进回放才能对齐
    if (this.inject.length) {
      const now = this.emitElapsed
      const pending: typeof this.inject = []
      const ready: typeof this.inject = []
      for (const it of this.inject) (it.at <= now + 1e-4 ? ready : pending).push(it)
      this.inject = pending
      for (const it of ready) this.emitInjected(it)
    }

    if (emitting && e.rate > 0) {
      this.rateAcc += e.rate * dt
      let n = Math.floor(this.rateAcc)
      this.rateAcc -= n
      while (n-- > 0) this.emitOne()
    }
    if (e.burst && emitting && e.burstInterval > 0) {
      this.burstTimer += dt
      while (this.burstTimer >= e.burstInterval) {
        this.burstTimer -= e.burstInterval
        for (let k = 0; k < e.burstCount; k++) this.emitOne()
      }
    }

    const step = dt
    const sub = this.doc.sub
    const col = this.doc.collide
    const floorY = col?.enabled ? col.floor : 0
    for (let i = 0; i < this.count; i++) {
      this.age[i] += step
      const lt0 = this.age[i] / this.life[i]
      let hitGround = false
      if (sub?.enabled && sub.trigger === 'ground' && this.py[i] < floorY) hitGround = true
      // 碰撞面「直接消亡」模式：撞线即死，与寿命结束走同一条清理分支
      if (col?.enabled && col.kill && this.py[i] < floorY) hitGround = true
      if (lt0 >= 1 || hitGround) {
        // 子发射：消亡 / 触地时把位置与（按 inherit 缩放的）速度交给引擎路由
        if (sub?.enabled && (hitGround || sub.trigger === 'death') && this.onSpawn) {
          const inh = Math.max(0, Math.min(1, sub.inherit))
          this.onSpawn(
            this.px[i],
            Math.max(0, this.py[i]),
            this.pz[i],
            this.vx[i] * inh,
            this.vy[i] * inh,
            this.vz[i] * inh,
            this.emitElapsed,
            Math.max(0, sub.spread)
          )
        }
        // swap-remove
        const last = this.count - 1
        if (i !== last) {
          this.px[i] = this.px[last]
          this.py[i] = this.py[last]
          this.pz[i] = this.pz[last]
          this.vx[i] = this.vx[last]
          this.vy[i] = this.vy[last]
          this.vz[i] = this.vz[last]
          this.age[i] = this.age[last]
          this.life[i] = this.life[last]
          this.angle[i] = this.angle[last]
          this.angVel[i] = this.angVel[last]
          this.seed[i] = this.seed[last]
        }
        this.count--
        i--
        continue
      }

      this.vy[i] += m.gravity[1] * step
      this.vx[i] += m.gravity[0] * step
      this.vz[i] += m.gravity[2] * step

      const damp = 1 / (1 + m.damping * step)
      this.vx[i] *= damp
      this.vy[i] *= damp
      this.vz[i] *= damp

      if (m.turbulence > 0) {
        const ts = m.turbulenceScale
        const ph = this.emitElapsed * 1.6
        this.vx[i] += Math.sin(this.py[i] * ts * 3.1 + this.px[i] * ts * 1.7 + ph) * m.turbulence * step
        this.vy[i] += Math.cos(this.px[i] * ts * 2.3 + this.pz[i] * ts * 1.9 + ph * 0.8) * m.turbulence * step
        this.vz[i] += Math.sin(this.pz[i] * ts * 2.7 + this.py[i] * ts * 2.1 + ph * 1.2) * m.turbulence * step
      }

      if (m.swirl !== 0) {
        const a = m.swirl * step
        const ca = Math.cos(a)
        const sa = Math.sin(a)
        const tvx = this.vx[i] * ca - this.vz[i] * sa
        const tvz = this.vx[i] * sa + this.vz[i] * ca
        this.vx[i] = tvx
        this.vz[i] = tvz
      }

      // 生命内速度 / 自旋倍率曲线
      const li = Math.min(63, Math.max(0, Math.round(lt0 * 63)))
      const spd = this.speedLUT[li]
      const spr = this.spinLUT[li]

      this.px[i] += this.vx[i] * step * spd
      this.py[i] += this.vy[i] * step * spd
      this.pz[i] += this.vz[i] * step * spd

      // 碰撞反弹：法向按 bounce 反射，切向按 friction 保留，贴地后再滚一小段
      if (col?.enabled && !col.kill && this.py[i] < col.floor) {
        this.py[i] = col.floor
        if (this.vy[i] < 0) this.vy[i] = -this.vy[i] * Math.max(0, Math.min(1, col.bounce))
        const fr = Math.max(0, Math.min(1, col.friction))
        this.vx[i] *= fr
        this.vz[i] *= fr
        // 反弹速度低于阈值就直接贴地，避免永远微微弹跳
        if (Math.abs(this.vy[i]) < 0.08) this.vy[i] = 0
      }

      this.angle[i] += this.angVel[i] * spr * step
    }
  }

  /** 写入 GPU 实例属性 */
  flush() {
    const n = this.count
    const A = this.attrs
    const pos = A.pos.array as Float32Array
    const vel = A.vel.array as Float32Array
    const col = A.color.array as Float32Array
    const siz = A.size.array as Float32Array
    const rot = A.rot.array as Float32Array
    const str = A.stretch.array as Float32Array
    const sd = A.seed.array as Float32Array
    const pg = A.prog.array as Float32Array

    const r = this.doc.render
    const curve = this.curveLUT
    const lut = this.colorLUT
    const brightness = this.doc.brightness
    const stretchK = this.doc.spin.stretch

    for (let i = 0; i < n; i++) {
      const t = this.age[i] / this.life[i]
      const lt = t < 0 ? 0 : t > 1 ? 1 : t

      pos[i * 3] = this.px[i]
      pos[i * 3 + 1] = this.py[i]
      pos[i * 3 + 2] = this.pz[i]
      vel[i * 3] = this.vx[i]
      vel[i * 3 + 1] = this.vy[i]
      vel[i * 3 + 2] = this.vz[i]

      const ci = Math.min(63, Math.round(lt * 63)) * 4
      // 粒度：每颗粒子的尺寸与亮度都带随机，避免整片粒子像同一张贴图复制
      const jitter = 0.82 + sd[i] * 0.42
      col[i * 4] = lut[ci] * brightness * (0.86 + sd[i] * 0.28)
      col[i * 4 + 1] = lut[ci + 1] * brightness * (0.86 + sd[i] * 0.28)
      col[i * 4 + 2] = lut[ci + 2] * brightness * (0.86 + sd[i] * 0.28)

      const fi = r.fadeIn > 0.001 ? lt / r.fadeIn : 1
      const fo = r.fadeOut > 0.001 ? (1 - lt) / r.fadeOut : 1
      // 淡入淡出 × 渐变色标透明度（生命内颜色曲线）
      col[i * 4 + 3] = Math.min(1, fi, fo, lut[ci + 3])

      const si = Math.min(63, Math.round(lt * 63))
      const baseSize = this.overrides.size ?? this.doc.sizeBase
      siz[i] = baseSize * curve[si] * jitter

      rot[i] = this.angle[i]
      sd[i] = this.seed[i]
      pg[i] = lt
      const speed = Math.sqrt(
        this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i] + this.vz[i] * this.vz[i]
      )
      str[i] = Math.max(0, speed * stretchK)
    }

    A.pos.needsUpdate = true
    A.vel.needsUpdate = true
    A.color.needsUpdate = true
    A.size.needsUpdate = true
    A.rot.needsUpdate = true
    A.stretch.needsUpdate = true
    A.seed.needsUpdate = true
    A.prog.needsUpdate = true
    this.geo.instanceCount = n
    if (this.inst && this.inst.visible) this.flushInst(n, col, siz)
  }

  update(dt: number) {
    if (!this.root.visible) return
    this.mat.uniforms.uTime.value = this.emitElapsed
    const steps = dt > 0.05 ? Math.ceil(dt / 0.05) : 1
    const stepDt = dt / steps
    for (let s = 0; s < steps; s++) this.simulate(stepDt)
    this.flush()
  }

  /** 时间轴回放/拖拽：从 0 快进到目标时间；skipReset 用于引擎先统一 reset 再逐个快进（子发射需要） */
  seekTo(time: number, skipReset = false) {
    if (!skipReset) this.reset()
    const step = 1 / 30
    let t = 0
    while (t < time - 1e-6) {
      const dt = Math.min(step, time - t)
      this.simulate(dt)
      t += dt
    }
    this.mat.uniforms.uTime.value = this.emitElapsed
    this.flush()
  }

  /** 清空待注入队列（引擎统一 reset 阶段调用，避免上一轮残留） */
  clearInject() {
    this.inject.length = 0
  }

  get alive() {
    return this.count
  }

  setOpacity(v: number) {
    this.mat.uniforms.uOpacity.value = v
    this.instMat.opacity = v
    this.instMat.transparent = this.instMat.blending === THREE.AdditiveBlending || v < 1
  }

  dispose() {
    this.geo.dispose()
    this.mat.dispose()
    if (this.inst) {
      this.inst.geometry.dispose()
      this.inst.dispose()
    }
    this.instMat.dispose()
  }
}
