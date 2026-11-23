import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import JSZip from 'jszip'
import type { EffectDoc, ModelDoc, ParticleDoc, TextureAsset, TrackProperty } from './types'
import { getCanvas, getTexture } from './textures'
import { instantiateModel } from './assets'
import { DOUBLE_SIDED_KINDS, godotPrimitive, buildGeometry } from './geometry'
import { gradientSamples } from './curve'

/** 判断曲线是否真的偏离常量 1（偏离才需要在导出提示里点名） */
function hasCurveOffset(curve?: { points: Array<{ t: number; v: number }> }): boolean {
  if (!curve?.points?.length) return false
  return curve.points.some((p) => Math.abs(p.v - 1) > 0.02)
}
import { GODOT_RUNTIME_GD } from './godotRuntime'

const DEG = Math.PI / 180
const round = (v: number, p = 4) => Number(v.toFixed(p))

function asciiName(s: string, fallback: string): string {
  const a = s
    .normalize('NFKD')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return a.length ? a.slice(0, 24) : fallback
}

function slugify(s: string): string {
  const a = asciiName(s, '')
  if (a) return a.toLowerCase()
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003
  return `fx_${h.toString(36)}`
}

function quatOf(rot: [number, number, number]): [number, number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'XYZ'))
  return [round(q.x, 5), round(q.y, 5), round(q.z, 5), round(q.w, 5)]
}

function canvasToBlob(asset: TextureAsset): Promise<Blob> {
  if (asset.dataUrl) {
    return fetch(asset.dataUrl).then((r) => r.blob())
  }
  const canvas = getCanvas(
    asset.gen,
    {
      seed: asset.params?.seed ?? 1,
      contrast: asset.params?.contrast ?? 1,
      softness: asset.params?.softness ?? 0.5,
      variant: asset.params?.variant ?? 0
    },
    512
  )
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b || new Blob()), 'image/png')
  })
}

/* -------------------------------- 粒子 -------------------------------- */
function exportParticles(p: ParticleDoc, texPath: string | null, vertical = false) {
  const e = p.emission
  const m = p.motion
  const s = p.spin
  const r = p.render
  const avgLife = (e.lifetimeMin + e.lifetimeMax) / 2
  const oneShot = e.burst && (e.burstInterval <= 0 || e.duration <= 0.1)
  const amount = Math.round(e.burst ? e.burstCount : e.rate * avgLife)

  const fadeIn = Math.max(0.001, r.fadeIn)
  const fadeOut = Math.max(0.001, r.fadeOut)
  const alphaFn = (t: number) => Math.min(1, t / fadeIn, (1 - t) / fadeOut, 1) * r.opacity
  const ramp = gradientSamples(p.gradient, 16, alphaFn).map((st) => [
    round(st.t, 4),
    round(Math.min(4, st.r * p.brightness), 4),
    round(Math.min(4, st.g * p.brightness), 4),
    round(Math.min(4, st.b * p.brightness), 4),
    round(st.a, 4)
  ])

  const shapeMap: Record<string, string> = {
    point: 'point',
    sphere: 'sphere',
    box: 'box',
    ring: 'ring',
    circle: 'circle',
    cone: 'cone'
  }

  return {
    amount: Math.max(1, Math.min(100000, amount)),
    lifetime: round(avgLife, 3),
    one_shot: oneShot,
    explosiveness: e.burst ? 0.65 : 0,
    preprocess: oneShot ? 0 : round(avgLife, 3),
    shape: shapeMap[e.shape] || 'point',
    radius: round(e.radius, 4),
    extents: e.size.map((v) => round(v, 4)),
    direction: m.direction.map((v) => round(v, 4)),
    spread: round(m.spread, 2),
    velocity_min: round(m.speedMin, 4),
    velocity_max: round(m.speedMax, 4),
    gravity: m.gravity.map((v) => round(v, 4)),
    damping: round(m.damping, 4),
    turbulence: round(m.turbulence, 4),
    turbulence_scale: round(m.turbulenceScale, 4),
    scale_min: round(p.sizeBase, 4),
    scale_max: round(p.sizeBase, 4),
    scale_curve: p.sizeCurve.points
      .slice()
      .sort((a, b) => a.t - b.t)
      .map((pt) => [round(pt.t, 4), round(pt.v, 4)]),
    color_ramp: ramp,
    angle_min: round(s.angleMin, 2),
    angle_max: round(s.angleMax, 2),
    angular_velocity_min: round(s.speedMin, 2),
    angular_velocity_max: round(s.speedMax, 2),
    texture: texPath || '',
    blend: r.blend === 'additive' ? 'additive' : 'alpha',
    stretch: round(s.stretch, 4),
    align: round(s.align, 3),
    // 竖向贴图（火焰 / 光束）在游戏引擎里也不做自由旋转，保持直立
    vertical
  }
}

/* -------------------------------- 模型 -------------------------------- */
function exportMaterial(m: ModelDoc) {
  return {
    albedo: m.material.color,
    emission: m.material.emissive,
    emission_energy: round(m.material.emissiveIntensity, 3),
    metallic: round(m.material.metalness, 3),
    roughness: round(m.material.roughness, 3),
    alpha: round(m.material.opacity, 3),
    uv_scale: round(m.material.uvRepeat, 3),
    blend: m.material.blend,
    unshaded: m.material.blend === 'additive',
    cull: DOUBLE_SIDED_KINDS.includes(m.geometry) ? 'double' : 'back'
  }
}

/* -------------------------------- GLB -------------------------------- */
async function buildGlb(doc: EffectDoc, names: string[], texPaths: Map<string, string>): Promise<ArrayBuffer | null> {
  const models = doc.objects.filter((o) => o.kind === 'model') as ModelDoc[]
  if (!models.length) return null

  const group = new THREE.Group()
  group.name = 'FastVFX'

  for (const m of models) {
    const idx = doc.objects.indexOf(m)
    if (m.geometry === 'imported') {
      // 上传模型：把 data/models 里的 GLB 解析后并入 models.glb，Godot 侧按节点名取用
      const asset = (doc.modelAssets || []).find((a) => a.id === m.assetId)
      const ref = asset?.url || asset?.dataUrl
      if (!ref) {
        console.warn('[FastVFX] 导入模型缺少二进制，已跳过', m.name)
        continue
      }
      try {
        const src = await instantiateModel(ref)
        const node = src.clone(true)
        node.name = names[idx]
        node.traverse((o) => {
          o.userData.fxIndex = idx
        })
        group.add(node)
      } catch (err) {
        console.warn('[FastVFX] 导入模型导出失败', m.name, err)
      }
      continue
    }
    const geo = buildGeometry(m.geometry, m.params)
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial())
    mesh.name = names[idx]

    const std = mesh.material as THREE.MeshStandardMaterial
    std.color.set(m.material.color)
    std.emissive.set(m.material.emissive)
    std.emissiveIntensity = m.material.emissiveIntensity
    std.metalness = m.material.metalness
    std.roughness = m.material.roughness
    std.transparent = m.material.opacity < 1
    std.opacity = m.material.opacity
    if (m.material.textureId) {
      const asset = doc.textures.find((t) => t.id === m.material.textureId)
      if (asset) {
        const tex = getTexture(asset)
        std.map = tex
        std.emissiveMap = tex
        std.emissiveIntensity = Math.max(0.05, m.material.emissiveIntensity)
      }
    }
    if (DOUBLE_SIDED_KINDS.includes(m.geometry)) std.side = THREE.DoubleSide
    mesh.userData.fxIndex = idx
    group.add(mesh)
  }

  // 纹理名与 JSON 对齐（GLB 内嵌图不参与导出目录映射，仅作参考）
  void texPaths

  const exporter = new GLTFExporter()
  try {
    const out = await exporter.parseAsync(group, { binary: true, onlyVisible: false, includeCustomExtensions: false })
    if (out instanceof ArrayBuffer) return out
    return null
  } catch (err) {
    console.warn('[FastVFX] GLB 导出失败，将只导出图元兜底', err)
    return null
  }
}

/* -------------------------------- 文档 -------------------------------- */
export interface GodotPackage {
  blob: Blob
  filename: string
  warnings: string[]
}

export async function buildGodotPackage(doc: EffectDoc): Promise<GodotPackage> {
  const warnings: string[] = []
  const slug = slugify(doc.name)
  // 节点名必须唯一且 ASCII，NodePath 才安全
  const used = new Set<string>()
  const names = doc.objects.map((o, i) => {
    const base = asciiName(o.name, '')
    let n = `FX_${String(i + 1).padStart(2, '0')}${base ? '_' + base : ''}`
    let k = 2
    while (used.has(n)) n = `${n}_${k++}`
    used.add(n)
    return n
  })

  // 贴图
  const texIds = new Set<string>()
  for (const o of doc.objects) {
    if (o.kind === 'particles' && o.render.textureId) texIds.add(o.render.textureId)
    if (o.kind === 'model' && o.material.textureId) texIds.add(o.material.textureId)
  }
  const texFolder = {} as Record<string, { blob: Blob; file: string }>
  let ti = 0
  for (const id of texIds) {
    const asset = doc.textures.find((t) => t.id === id)
    if (!asset) {
      warnings.push(`贴图 ${id} 不存在，已跳过`)
      continue
    }
    const file = `${String(++ti).padStart(2, '0')}_${asciiName(asset.name, asset.gen)}.png`
    texFolder[id] = { file: `textures/${file}`, blob: await canvasToBlob(asset) }
  }

  // 对象
  const objects = doc.objects.map((o, i) => {
    const base = {
      name: names[i],
      kind: o.kind,
      position: o.transform.position.map((v) => round(v, 4)),
      quaternion: quatOf(o.transform.rotation),
      scale: o.transform.scale.map((v) => round(v, 4))
    }
    if (o.kind === 'particles') {
      const tex = o.render.textureId ? texFolder[o.render.textureId]?.file || '' : ''
      const gen = doc.textures.find((t) => t.id === o.render.textureId)?.gen || ''
      return { ...base, particles: exportParticles(o, tex, gen === 'flame' || gen === 'beam') }
    }
    const mat = exportMaterial(o)
    return {
      ...base,
      mesh: godotPrimitive(o.geometry, o.params),
      material: {
        ...mat,
        texture: o.material.textureId ? texFolder[o.material.textureId]?.file || '' : ''
      }
    }
  })

  // 动画
  const propMap: Record<TrackProperty, string> = {
    position: 'position',
    rotation: 'quaternion',
    scale: 'scale',
    opacity: 'transparency',
    radius: 'radius',
    clusters: 'clusters',
    size: 'size'
  }
  // 范围 / 簇 / 尺寸 属于编辑器侧的粒子参数，Godot 节点没有对应属性：导出跳过，取静态值
  const editorOnly: TrackProperty[] = ['radius', 'clusters', 'size']
  doc.tracks.forEach((tr) => {
    if (editorOnly.includes(tr.property) && tr.keys.length) {
      const msg = `「${propMap[tr.property]}」关键帧仅编辑器内生效，Godot 侧使用静态值`
      if (!warnings.includes(msg)) warnings.push(msg)
    }
  })
  const tracks = doc.tracks
    .filter((tr) => tr.keys.length > 0 && doc.objects.some((o) => o.id === tr.targetId))
    .filter((tr) => !editorOnly.includes(tr.property))
    .map((tr) => {
      const idx = doc.objects.findIndex((o) => o.id === tr.targetId)
      const keys = tr.keys
        .slice()
        .sort((a, b) => a.t - b.t)
        .map((k) => {
          let value: any
          if (tr.property === 'rotation' && Array.isArray(k.v)) value = quatOf(k.v as [number, number, number])
          else if (tr.property === 'opacity' && typeof k.v === 'number') value = round(1 - k.v, 4)
          else if (Array.isArray(k.v)) value = k.v.map((v) => round(v, 4))
          else value = round(k.v as number, 4)
          return [round(Math.min(doc.duration, Math.max(0, k.t)), 4), value]
        })
      return { node: names[idx], property: propMap[tr.property], keys, smooth: tr.smooth }
    })

  if (doc.tracks.some((t) => t.property === 'opacity')) {
    warnings.push('透明度动画在 Godot 中映射为 GeometryInstance3D.transparency（仅网格对象生效）')
  }

  // 本轮新增能力在 Godot 侧的落差
  const curved = doc.objects.filter((o): o is ParticleDoc => o.kind === 'particles' && hasCurveOffset(o.speedCurve))
  if (curved.length) {
    warnings.push(`「${curved.map((o) => o.name).join('、')}」使用了生命内速度倍率曲线，Godot 侧只导出静态速度（曲线仅编辑器内生效）`)
  }
  const spun = doc.objects.filter((o): o is ParticleDoc => o.kind === 'particles' && hasCurveOffset(o.spinCurve))
  if (spun.length) {
    warnings.push(`「${spun.map((o) => o.name).join('、')}」使用了生命内自旋倍率曲线，Godot 侧角速度按静态值导出`)
  }
  const subs = doc.objects.filter(
    (o): o is ParticleDoc => o.kind === 'particles' && !!o.sub?.enabled && !!o.sub.targetId
  )
  if (subs.length) {
    warnings.push(
      `「${subs.map((o) => o.name).join('、')}」配置了子发射，Godot 运行时脚本暂不支持跨发射器注入，需用 GPUParticles3D + sub_emitter 自行接`
    )
  }
  const flips = doc.objects.filter(
    (o): o is ParticleDoc => o.kind === 'particles' && !!o.render.flipbook?.enabled
  )
  if (flips.length) {
    warnings.push(
      `「${flips.map((o) => o.name).join('、')}」使用序列帧贴图：导出只带整张图集，Godot 侧需用 ShaderMaterial + 图集 UV 偏移自行按生命播放，或另拆帧序列`
    )
  }
  const bouncers = doc.objects.filter(
    (o): o is ParticleDoc => o.kind === 'particles' && !!o.collide?.enabled
  )
  if (bouncers.length) {
    warnings.push(
      `「${bouncers.map((o) => o.name).join('、')}」使用地面碰撞反弹：Godot 侧需在粒子着色器或脚本里自行实现碰撞，导出参数只作参考`
    )
  }

  const glb = await buildGlb(doc, names, new Map())
  if (!glb) warnings.push('模型将以 Godot 内置图元近似（GLB 未生成）')

  const cfg = {
    generator: 'FastVFX',
    version: 1,
    name: doc.name,
    duration: round(doc.duration, 3),
    loop: doc.loop,
    models_glb: glb ? 'models.glb' : '',
    objects,
    animation: { length: round(doc.duration, 3), loop: doc.loop, tracks }
  }

  const zip = new JSZip()
  const root = zip.folder(slug)!
  root.file('vfx.json', JSON.stringify(cfg, null, 2))
  root.file('vfx_runtime.gd', GODOT_RUNTIME_GD)
  if (glb) root.file('models.glb', new Uint8Array(glb))
  const texDir = root.folder('textures')!
  for (const key of Object.keys(texFolder)) {
    texDir.file(texFolder[key].file.split('/')[1], texFolder[key].blob)
  }

  const tscnName = `${slug}.tscn`
  const tscn = `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://${slug}/vfx_runtime.gd" id="1_vfx"]

[node name="VFXRoot" type="Node3D"]
script = ExtResource("1_vfx")
config_path = "res://${slug}/vfx.json"
`
  root.file(tscnName, tscn)

  root.file('README.md', buildReadme(doc, slug, tscnName, warnings))

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  return { blob, filename: `${slug}_godot.zip`, warnings }
}

function buildReadme(doc: EffectDoc, slug: string, tscn: string, warnings: string[]): string {
  const lines: string[] = []
  lines.push(`# ${doc.name} · FastVFX 导出包`)
  lines.push('')
  lines.push('本目录由 FastVFX 生成，可直接拖入 Godot 4 项目使用。')
  lines.push('')
  lines.push('## 快速使用')
  lines.push('')
  lines.push('1. 把整个文件夹拖到 Godot 项目根目录（保持文件夹名不变）。')
  lines.push('2. 等待编辑器导入 `models.glb` 与 `textures/*.png`。')
  lines.push(`3. 打开 \`${tscn}\`，运行场景即可看到特效；或把该场景实例化到你的关卡中。`)
  lines.push('')
  lines.push('```gdscript')
  lines.push(`var fx = preload("res://${slug}/${tscn}").instantiate()`)
  lines.push('add_child(fx)')
  lines.push('fx.position = Vector3(0, 0, 0)')
  lines.push('```')
  lines.push('')
  lines.push('## 文件说明')
  lines.push('')
  lines.push('| 文件 | 作用 |')
  lines.push('| --- | --- |')
  lines.push('| `vfx.json` | 特效配置（粒子参数 / 变换 / 动画） |')
  lines.push('| `vfx_runtime.gd` | 运行时构建脚本，`@tool` 支持编辑器预览 |')
  lines.push('| `models.glb` | 网格模型（含材质） |')
  lines.push('| `textures/` | 粒子与模型贴图 |')
  lines.push('| `' + tscn + '` | 可直接打开的场景 |')
  lines.push('')
  lines.push('## 还原对应关系')
  lines.push('')
  lines.push('| FastVFX | Godot 4 |')
  lines.push('| --- | --- |')
  lines.push('| 粒子发射器 | `GPUParticles3D` + `ParticleProcessMaterial` |')
  lines.push('| 发射形状 | `EMISSION_SHAPE_POINT/SPHERE/BOX/RING` |')
  lines.push('| 颜色渐变 | `color_ramp` (GradientTexture1D) |')
  lines.push('| 大小曲线 | `scale_curve` (CurveTexture) |')
  lines.push('| 加色混合 | `BLEND_MODE_ADD` + 无光照 + 关闭深度写入 |')
  lines.push('| 内置几何体 | `MeshInstance3D`（GLB 优先，缺失时用图元近似） |')
  lines.push('| 关键帧 | `AnimationPlayer`（位置 / 四元数 / 缩放 / 透明度） |')
  lines.push('')
  lines.push('## 已知差异')
  lines.push('')
  lines.push('- 逐粒子速度拉伸（stretch）在 Godot 中退化为 `particle_flag_align_y` 朝向。')
  lines.push('- 发射器 `duration`（局部发射时长）与「按间隔重复爆发」不支持，粒子按持续/单次爆发处理。')
  lines.push('- 湍流为近似参数，数值与浏览器预览不逐一对应。')
  lines.push('- 相机机位不随特效导出。')
  if (warnings.length) {
    lines.push('')
    lines.push('## 本次导出提示')
    lines.push('')
    for (const w of warnings) lines.push(`- ${w}`)
  }
  lines.push('')
  return lines.join('\n')
}

export async function exportGodotZip(doc: EffectDoc): Promise<GodotPackage> {
  return buildGodotPackage(doc)
}
