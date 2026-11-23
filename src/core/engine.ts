import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { EffectDoc, FXObject, Keyframe, ModelDoc, ParticleDoc, Track, Vec3 } from './types'
import { buildGeometry, geometryKey, DOUBLE_SIDED_KINDS } from './geometry'
import { ParticleSystem } from './particles'
import { getTexture } from './textures'

export type GizmoMode = 'select' | 'translate' | 'rotate' | 'scale'

export interface EngineState {
  doc: EffectDoc
  selectedId: string | null
  time: number
  playing: boolean
  mode: GizmoMode
  autoKey: boolean
}

export interface EngineCallbacks {
  onSelect: (id: string | null) => void
  onTime: (t: number) => void
  onFps: (fps: number) => void
  onTransform: (id: string, prop: 'position' | 'rotation' | 'scale') => void
}

interface Runtime {
  id: string
  kind: 'particles' | 'model'
  group: THREE.Group
  picker: THREE.Mesh
  particle?: ParticleSystem
  mesh?: THREE.Mesh
  material?: THREE.MeshStandardMaterial
  geoKey?: string
  opacity: number
}

const DEG = Math.PI / 180

export class FXEngine {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly root = new THREE.Group()
  private composer: EffectComposer
  private bloomPass: UnrealBloomPass
  private controls: OrbitControls
  private gizmo: TransformControls
  private grid: THREE.GridHelper
  private boxHelper: THREE.BoxHelper
  private runtimes = new Map<string, Runtime>()
  private raycaster = new THREE.Raycaster()
  private pointerDown = { x: 0, y: 0, time: 0 }
  private state: EngineState
  private cb: EngineCallbacks
  private clock = new THREE.Clock()
  private selectedId: string | null = null
  private appliedTime = 0
  private lastSeek = -999
  private dirty = false
  private frameCount = 0
  private fpsAcc = 0
  private raf = 0
  private disposed = false
  private lastCameraKey = ''

  constructor(
    private canvas: HTMLCanvasElement,
    state: EngineState,
    cb: EngineCallbacks
  ) {
    this.state = state
    this.cb = cb

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.95
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.camera = new THREE.PerspectiveCamera(state.doc.camera.fov, 1, 0.05, 500)
    this.scene.add(this.root)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI * 0.96
    this.controls.minDistance = 0.5
    this.controls.maxDistance = 60

    this.gizmo = new TransformControls(this.camera, canvas)
    this.gizmo.setSize(0.85)
    this.scene.add(this.gizmo.getHelper())
    this.gizmo.addEventListener('dragging-changed', (e: any) => {
      this.controls.enabled = !e.value
    })
    this.gizmo.addEventListener('mouseDown', () => this.pushSnapshot())
    this.gizmo.addEventListener('objectChange', () => this.syncBackFromGizmo())

    this.addLights()
    this.grid = new THREE.GridHelper(24, 24, 0x2f3b52, 0x18202e)
    ;(this.grid.material as THREE.Material).transparent = true
    ;(this.grid.material as THREE.Material).opacity = 0.55
    this.grid.position.y = 0.001
    this.scene.add(this.grid)

    this.boxHelper = new THREE.BoxHelper(new THREE.Object3D(), 0xffc14d)
    ;(this.boxHelper.material as THREE.LineBasicMaterial).transparent = true
    ;(this.boxHelper.material as THREE.LineBasicMaterial).opacity = 0.9
    this.boxHelper.visible = false
    this.scene.add(this.boxHelper)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.28, 0.86)
    this.composer.addPass(this.bloomPass)
    this.composer.addPass(new OutputPass())

    this.applyCamera(true)
    this.resize()
    this.sync()
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)

    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointerup', this.onPointerUp)

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas.parentElement || canvas)
  }

  private ro: ResizeObserver

  /** 外部在拖拽 gizmo 前调用，保存历史 */
  onBeforeEdit: (() => void) | null = null
  private pushSnapshot() {
    this.onBeforeEdit?.()
  }

  private addLights() {
    const hemi = new THREE.HemisphereLight(0x9aa8ff, 0x0a0c14, 0.9)
    this.scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 2.4)
    key.position.set(5, 7, 5)
    this.scene.add(key)
    const rim = new THREE.DirectionalLight(0x5b7bff, 1.6)
    rim.position.set(-6, 3, -5)
    this.scene.add(rim)
    const fill = new THREE.PointLight(0xff8a3d, 1.2, 18)
    fill.position.set(0, 1.6, 0.4)
    this.scene.add(fill)
  }

  /* ------------------------------ 场景同步 ------------------------------ */
  sync() {
    const doc = this.state.doc
    this.scene.background = new THREE.Color(doc.bg)
    this.renderer.setClearColor(new THREE.Color(doc.bg), 1)
    this.grid.visible = doc.grid
    this.bloomPass.strength = doc.bloomStrength
    this.bloomPass.enabled = doc.bloom

    const live = new Set<string>()
    for (const obj of doc.objects) {
      live.add(obj.id)
      let rt = this.runtimes.get(obj.id)
      if (!rt) {
        rt = this.createRuntime(obj)
        this.runtimes.set(obj.id, rt)
        this.root.add(rt.group)
        this.dirty = true
      }
      this.updateRuntime(rt, obj, doc)
      rt.group.visible = obj.visible
    }
    for (const [id, rt] of this.runtimes) {
      if (!live.has(id)) {
        this.root.remove(rt.group)
        rt.particle?.dispose()
        rt.mesh?.geometry.dispose()
        rt.material?.dispose()
        this.runtimes.delete(id)
        this.dirty = true
      }
    }
    const camKey = doc.camera.position.join(',') + '|' + doc.camera.target.join(',') + '|' + doc.camera.fov
    if (camKey !== this.lastCameraKey) {
      this.lastCameraKey = camKey
      this.applyCamera(true)
    }
    if (this.state.selectedId !== this.selectedId) this.setSelection(this.state.selectedId)
    this.dirty = true
  }

  private createRuntime(obj: FXObject): Runtime {
    const group = new THREE.Group()
    group.name = obj.name
    group.userData.fxId = obj.id
    const pickerMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
    const picker = new THREE.Mesh(new THREE.SphereGeometry(obj.kind === 'model' ? 0.6 : 0.42, 16, 12), pickerMat)
    picker.userData.fxId = obj.id
    group.add(picker)
    if (obj.kind === 'particles') {
      const particle = new ParticleSystem(obj, this.state.doc.textures)
      group.add(particle.mesh)
      return { id: obj.id, kind: 'particles', group, picker, particle, opacity: 1 }
    }
    return { id: obj.id, kind: 'model', group, picker, opacity: 1 }
  }

  private updateRuntime(rt: Runtime, obj: FXObject, doc: EffectDoc) {
    if (obj.kind === 'particles' && rt.particle) {
      rt.particle.doc = obj
      rt.particle.applySettings(doc.textures)
      this.dirty = true
      return
    }
    if (obj.kind === 'model') {
      const rtM = rt as Runtime
      const key = geometryKey(obj.geometry, obj.params)
      if (!rtM.mesh) {
        const geo = buildGeometry(obj.geometry, obj.params)
        const material = new THREE.MeshStandardMaterial()
        rtM.mesh = new THREE.Mesh(geo, material)
        rtM.mesh.userData.fxId = obj.id
        rtM.material = material
        rtM.group.add(rtM.mesh)
        rtM.geoKey = key
        rtM.picker.scale.setScalar(Math.max(0.12, obj.params.radius))
      } else if (rtM.geoKey !== key) {
        rtM.mesh.geometry.dispose()
        rtM.mesh.geometry = buildGeometry(obj.geometry, obj.params)
        rtM.geoKey = key
        rtM.picker.scale.setScalar(Math.max(0.12, obj.params.radius))
      }
      this.applyModelMaterial(rtM, obj, doc)
    }
  }

  private applyModelMaterial(rt: Runtime, obj: ModelDoc, doc: EffectDoc) {
    const m = rt.material!
    const mat = obj.material
    const tex = mat.textureId ? getTexture(doc.textures.find((t) => t.id === mat.textureId)) : null
    m.map = tex
    if (tex) {
      const rep = Math.max(1, mat.uvRepeat)
      if (!tex.repeat.equals(new THREE.Vector2(rep, rep))) tex.repeat.set(rep, rep)
      tex.needsUpdate = true
    }
    m.color.set(mat.color)
    m.emissive.set(mat.emissive)
    m.emissiveIntensity = mat.emissiveIntensity
    m.metalness = mat.metalness
    m.roughness = mat.roughness
    m.wireframe = mat.wireframe
    m.flatShading = mat.flatShading
    m.side = DOUBLE_SIDED_KINDS.includes(obj.geometry) ? THREE.DoubleSide : THREE.FrontSide
    m.transparent = true
    m.blending =
      mat.blend === 'additive' ? THREE.AdditiveBlending : mat.blend === 'alpha' ? THREE.NormalBlending : THREE.NormalBlending
    m.depthWrite = mat.blend === 'opaque' && rt.opacity >= 1
    m.opacity = rt.opacity * mat.opacity
    m.needsUpdate = true
  }

  /* ------------------------------ 动画采样 ------------------------------ */
  private sampleValue(track: Track, time: number): number | Vec3 | null {
    const keys: Keyframe[] = track.keys
    if (!keys.length) return null
    if (time <= keys[0].t) return keys[0].v
    const last = keys[keys.length - 1]
    if (time >= last.t) return last.v
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i]
      const b = keys[i + 1]
      if (time >= a.t && time <= b.t) {
        const span = Math.max(1e-6, b.t - a.t)
        let u = (time - a.t) / span
        if (track.smooth) u = u * u * (3 - 2 * u)
        if (Array.isArray(a.v) && Array.isArray(b.v)) {
          return [a.v[0] + (b.v[0] - a.v[0]) * u, a.v[1] + (b.v[1] - a.v[1]) * u, a.v[2] + (b.v[2] - a.v[2]) * u] as Vec3
        }
        return (a.v as number) + ((b.v as number) - (a.v as number)) * u
      }
    }
    return last.v
  }

  private applyTransforms(time: number) {
    const doc = this.state.doc
    for (const rt of this.runtimes.values()) {
      const obj = doc.objects.find((o) => o.id === rt.id)
      if (!obj) continue
      const pos = obj.transform.position
      const rot = obj.transform.rotation
      const scl = obj.transform.scale
      let px = pos[0]
      let py = pos[1]
      let pz = pos[2]
      let rx = rot[0]
      let ry = rot[1]
      let rz = rot[2]
      let sx = scl[0]
      let sy = scl[1]
      let sz = scl[2]
      let opacity = 1
      let emitRadius = -1
      let clusters = -1
      let sizeBase = -1
      for (const tr of doc.tracks) {
        if (tr.targetId !== rt.id) continue
        const v = this.sampleValue(tr, time)
        if (v === null) continue
        if (tr.property === 'position' && Array.isArray(v)) {
          px = v[0]
          py = v[1]
          pz = v[2]
        } else if (tr.property === 'rotation' && Array.isArray(v)) {
          rx = v[0]
          ry = v[1]
          rz = v[2]
        } else if (tr.property === 'scale' && Array.isArray(v)) {
          sx = v[0]
          sy = v[1]
          sz = v[2]
        } else if (tr.property === 'opacity' && typeof v === 'number') {
          opacity = v
        } else if (tr.property === 'radius' && typeof v === 'number') {
          emitRadius = v
        } else if (tr.property === 'clusters' && typeof v === 'number') {
          clusters = v
        } else if (tr.property === 'size' && typeof v === 'number') {
          sizeBase = v
        }
      }
      rt.group.position.set(px, py, pz)
      rt.group.rotation.set(rx * DEG, ry * DEG, rz * DEG, 'XYZ')
      rt.group.scale.set(sx, sy, sz)
      rt.opacity = opacity
      if (rt.kind === 'model' && rt.material && obj.kind === 'model') {
        const mat = obj.material
        rt.material.opacity = opacity * mat.opacity
        rt.material.transparent = true
        rt.material.depthWrite = mat.blend === 'opaque' && rt.material.opacity >= 0.999
      } else if (rt.particle) {
        rt.particle.overrides.radius = emitRadius >= 0 ? emitRadius : null
        rt.particle.overrides.clusters = clusters >= 0 ? clusters : null
        rt.particle.overrides.size = sizeBase > 0 ? sizeBase : null
        rt.particle.setOpacity(opacity * rt.particle.doc.render.opacity)
      }
    }
    this.updateSelectionHelper()
  }

  private updateSelectionHelper() {
    if (!this.selectedId) {
      this.boxHelper.visible = false
      return
    }
    const rt = this.runtimes.get(this.selectedId)
    if (!rt) {
      this.boxHelper.visible = false
      return
    }
    this.boxHelper.visible = true
    this.boxHelper.setFromObject(rt.group)
  }

  /* ------------------------------ 播放控制 ------------------------------ */
  private stepEmitters(dt: number) {
    for (const rt of this.runtimes.values()) rt.particle?.update(dt)
  }

  private resetEmitters() {
    for (const rt of this.runtimes.values()) rt.particle?.reset()
  }

  seek(time: number) {
    this.lastSeek = time
    this.appliedTime = time
    for (const rt of this.runtimes.values()) rt.particle?.seekTo(time)
    this.applyTransforms(time)
    this.dirty = false
  }

  private loop() {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(0.05, this.clock.getDelta())
    const st = this.state
    const doc = st.doc

    if (st.playing) {
      st.time += dt
      if (st.time >= doc.duration) {
        if (doc.loop) {
          st.time = st.time % doc.duration
          this.resetEmitters()
          this.lastSeek = -999
        } else {
          st.time = doc.duration
          st.playing = false
        }
        this.cb.onTime(st.time)
      } else if (Math.abs(st.time - this.appliedTime) > 0.4) {
        this.cb.onTime(st.time)
      }
      this.stepEmitters(dt)
      this.appliedTime = st.time
      this.lastSeek = -999
    } else if (this.dirty || Math.abs(st.time - this.lastSeek) > 1e-4) {
      this.seek(st.time)
    }

    this.applyTransforms(st.time)
    this.controls.update()

    // FPS
    this.fpsAcc += dt
    this.frameCount++
    if (this.fpsAcc > 0.5) {
      this.cb.onFps(Math.round(this.frameCount / this.fpsAcc))
      this.fpsAcc = 0
      this.frameCount = 0
    }

    if (doc.bloom) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  /* ------------------------------ 交互 ------------------------------ */
  private onPointerDown = (e: PointerEvent) => {
    this.pointerDown = { x: e.clientX, y: e.clientY, time: performance.now() }
  }

  private onPointerUp = (e: PointerEvent) => {
    const dx = e.clientX - this.pointerDown.x
    const dy = e.clientY - this.pointerDown.y
    if (Math.hypot(dx, dy) > 5) return
    const rect = this.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )
    this.raycaster.setFromCamera(ndc, this.camera)
    const groups = Array.from(this.runtimes.values()).map((r) => r.group)
    const hits = this.raycaster.intersectObjects(groups, true)
    let id: string | null = null
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object
      while (o) {
        if (o.userData.fxId) {
          id = o.userData.fxId
          break
        }
        o = o.parent
      }
      if (id) break
    }
    this.cb.onSelect(id)
    this.setSelection(id)
  }

  setSelection(id: string | null) {
    this.selectedId = id
    const rt = id ? this.runtimes.get(id) : null
    if (rt && this.state.mode !== 'select') {
      this.gizmo.attach(rt.group)
    } else if (rt) {
      this.gizmo.detach()
    } else {
      this.gizmo.detach()
    }
    this.updateSelectionHelper()
  }

  setMode(mode: GizmoMode) {
    this.state.mode = mode
    if (mode === 'select') {
      this.gizmo.detach()
    } else {
      this.gizmo.setMode(mode)
      const rt = this.selectedId ? this.runtimes.get(this.selectedId) : null
      if (rt) this.gizmo.attach(rt.group)
    }
  }

  private syncBackFromGizmo() {
    const id = this.selectedId
    if (!id) return
    const rt = this.runtimes.get(id)
    const obj = this.state.doc.objects.find((o) => o.id === id)
    if (!rt || !obj) return
    obj.transform.position = [rt.group.position.x, rt.group.position.y, rt.group.position.z]
    obj.transform.rotation = [
      rt.group.rotation.x / DEG,
      rt.group.rotation.y / DEG,
      rt.group.rotation.z / DEG
    ]
    obj.transform.scale = [rt.group.scale.x, rt.group.scale.y, rt.group.scale.z]
    this.cb.onTransform(id, 'position')
    this.cb.onTransform(id, 'rotation')
    this.cb.onTransform(id, 'scale')
  }

  /* ------------------------------ 相机 / 尺寸 ------------------------------ */
  applyCamera(immediate = false) {
    const cam = this.state.doc.camera
    this.camera.fov = cam.fov
    this.camera.updateProjectionMatrix()
    this.camera.position.set(cam.position[0], cam.position[1], cam.position[2])
    this.controls.target.set(cam.target[0], cam.target[1], cam.target[2])
    this.controls.update()
    if (immediate) this.lastCameraKey = cam.position.join(',') + '|' + cam.target.join(',') + '|' + cam.fov
  }

  captureCamera() {
    const cam = this.state.doc.camera
    cam.position = [
      Number(this.camera.position.x.toFixed(2)),
      Number(this.camera.position.y.toFixed(2)),
      Number(this.camera.position.z.toFixed(2))
    ]
    cam.target = [
      Number(this.controls.target.x.toFixed(2)),
      Number(this.controls.target.y.toFixed(2)),
      Number(this.controls.target.z.toFixed(2))
    ]
    this.lastCameraKey = cam.position.join(',') + '|' + cam.target.join(',') + '|' + cam.fov
  }

  resize() {
    const parent = this.canvas.parentElement
    const w = Math.max(1, parent?.clientWidth || this.canvas.clientWidth)
    const h = Math.max(1, parent?.clientHeight || this.canvas.clientHeight)
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.bloomPass.resolution.set(w, h)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.gizmo.detach()
    this.gizmo.dispose()
    for (const rt of this.runtimes.values()) {
      rt.particle?.dispose()
      rt.mesh?.geometry.dispose()
      rt.material?.dispose()
    }
    this.composer.dispose()
    this.renderer.dispose()
  }
}
