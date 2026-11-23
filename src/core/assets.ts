import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * 模型来源优先级：项目内 data/models 的相对 URL > base64 临时数据。
 * 解析结果按来源字符串缓存，多个实例共享同一份几何/材质。
 */
const cache = new Map<string, Promise<THREE.Group>>()
const loader = new GLTFLoader()

function dataUrlToArrayBuffer(url: string): ArrayBuffer {
  const comma = url.indexOf(',')
  const head = url.slice(0, comma)
  const body = url.slice(comma + 1)
  if (head.includes(';base64')) {
    const bin = atob(body)
    const len = bin.length
    const buf = new Uint8Array(len)
    for (let i = 0; i < len; i++) buf[i] = bin.charCodeAt(i)
    return buf.buffer
  }
  const text = decodeURIComponent(body)
  const buf = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) buf[i] = text.charCodeAt(i)
  return buf.buffer
}

async function readBinary(ref: string): Promise<ArrayBuffer> {
  if (ref.startsWith('data:')) return dataUrlToArrayBuffer(ref)
  const res = await fetch(ref)
  if (!res.ok) throw new Error(`模型读取失败：${ref} (${res.status})`)
  return res.arrayBuffer()
}

export function parseModel(ref: string): Promise<THREE.Group> {
  const hit = cache.get(ref)
  if (hit) return hit
  const task = new Promise<THREE.Group>((resolve, reject) => {
    readBinary(ref)
      .then((buf) => {
        loader.parse(
          buf,
          '',
          (gltf) => resolve(gltf.scene),
          (err) => reject(err)
        )
      })
      .catch(reject)
  })
  cache.set(ref, task)
  return task
}

/** 取一份可自由修改的实例（几何与纹理共享，避免重复解析） */
export async function instantiateModel(ref: string): Promise<THREE.Group> {
  const src = await parseModel(ref)
  return src.clone(true)
}

export function disposeModelCache() {
  for (const task of cache.values()) {
    task.then((g) => {
      g.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) {
          mesh.geometry?.dispose()
          const mat = mesh.material
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
          else mat?.dispose()
        }
      })
    })
  }
  cache.clear()
}

/** 估算三角形数量，用于列表展示 */
export function countTriangles(group: THREE.Object3D): number {
  let n = 0
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && mesh.geometry) {
      const idx = mesh.geometry.getIndex()
      const pos = mesh.geometry.getAttribute('position')
      if (idx) n += idx.count / 3
      else if (pos) n += pos.count / 3
    }
  })
  return Math.round(n)
}

/* ------------------------- 与 dev server 的模型目录交互 ------------------------- */

export interface ServerModelFile {
  file: string
  url: string
  sizeKB: number
  mtime: number
}

export async function listServerModels(): Promise<ServerModelFile[]> {
  try {
    const res = await fetch('/api/models/list')
    if (!res.ok) return []
    const data = (await res.json()) as { files: ServerModelFile[] }
    return data.files || []
  } catch {
    return []
  }
}

export async function saveServerModel(name: string, buffer: ArrayBuffer): Promise<{ url: string; file: string; sizeKB: number } | null> {
  try {
    // ArrayBuffer -> base64（分段避免栈溢出）
    const bytes = new Uint8Array(buffer)
    let bin = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
    }
    const base64 = btoa(bin)
    const res = await fetch('/api/models/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, base64 })
    })
    if (!res.ok) return null
    return (await res.json()) as { url: string; file: string; sizeKB: number }
  } catch {
    return null
  }
}

export async function deleteServerModel(file: string): Promise<boolean> {
  try {
    const res = await fetch('/api/models/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file })
    })
    return res.ok
  } catch {
    return false
  }
}
