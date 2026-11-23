import * as THREE from 'three'

type Params = { seed: number; contrast: number; softness: number }

/* ---------------- 噪声工具 ---------------- */
function hash2(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967295
}

function smoothNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const cc = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + cc * (1 - u) * v + d * u * v
}

function fbm(x: number, y: number, seed: number, octaves = 4, gain = 1): number {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += smoothNoise(x * freq, y * freq, seed + i * 13) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return (sum / norm) * gain
}

/* ---------------- 绘制辅助 ---------------- */
function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas')
  cv.width = size
  cv.height = size
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  return [cv, ctx]
}

/** 逐像素写 alpha（RGB 固定白色，方便着色） */
function pixelAlpha(
  ctx: CanvasRenderingContext2D,
  size: number,
  fn: (x: number, y: number) => number,
  rgb: [number, number, number] = [255, 255, 255]
) {
  const img = ctx.createImageData(size, size)
  const data = img.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = Math.max(0, Math.min(1, fn(x / size, y / size)))
      const i = (y * size + x) * 4
      data[i] = rgb[0]
      data[i + 1] = rgb[1]
      data[i + 2] = rgb[2]
      data[i + 3] = Math.round(a * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
}

/* ---------------- 生成器 ---------------- */
export interface GenDef {
  id: string
  name: string
  draw: (ctx: CanvasRenderingContext2D, size: number, p: Params) => void
}

const radialGlow = (u: number, v: number, pow: number, radius = 0.5) => {
  const dx = u - 0.5
  const dy = v - 0.5
  const d = Math.sqrt(dx * dx + dy * dy) / radius
  return d >= 1 ? 0 : Math.pow(1 - d, pow)
}

export const GENERATORS: GenDef[] = [
  {
    id: 'glow',
    name: '柔光',
    draw: (ctx, size, p) => pixelAlpha(ctx, size, (u, v) => radialGlow(u, v, 2.2 + p.softness * 2, 0.5))
  },
  {
    id: 'dot',
    name: '圆点',
    draw: (ctx, size) =>
      pixelAlpha(ctx, size, (u, v) => {
        const d = Math.hypot(u - 0.5, v - 0.5)
        return d > 0.42 ? 0 : Math.min(1, (0.42 - d) * 12)
      })
  },
  {
    id: 'smoke',
    name: '烟雾',
    draw: (ctx, size, p) => {
      const seed = p.seed
      const soft = p.softness
      pixelAlpha(ctx, size, (u, v) => {
        const dx = u - 0.5
        const dy = v - 0.5
        const r = Math.sqrt(dx * dx + dy * dy)
        // 不规则边界：让烟团轮廓被噪声顶开，不再是标准圆
        const edgeN = fbm(u * 3.4 + seed * 0.7, v * 3.4 + seed * 0.4, seed + 17, 3)
        const mask = Math.max(0, 1 - r / (0.5 * (0.86 + edgeN * 0.34)))
        if (mask <= 0) return 0
        const nBig = fbm(u * 3.6 + seed * 0.3, v * 3.6, seed, 4)
        const nFine = fbm(u * 7.4 + seed * 1.1, v * 7.4 + seed * 0.5, seed + 9, 4)
        // 两层噪声 + 偏移双叶，才有翻滚的絮状结构
        const lobe = fbm(u * 2.2 - 0.8, v * 2.2 + 0.7, seed + 23, 3)
        const shaped = (nBig * 0.62 + nFine * 0.28 + lobe * 0.28 - 0.36) * 1.55 + 0.5
        const a = Math.max(0, shaped) * Math.pow(mask, 1.5 + soft * 1.5)
        return a
      })
    }
  },
  {
    id: 'flame',
    name: '火焰',
    draw: (ctx, size, p) => {
      const seed = p.seed
      const smooth = (a: number, b: number, x: number) => {
        const u = Math.max(0, Math.min(1, (x - a) / (b - a)))
        return u * u * (3 - 2 * u)
      }
      pixelAlpha(ctx, size, (u, v) => {
        const yy = 1 - v // 0 = 顶部, 1 = 底部
        // 域扭曲：整条火舌会随高度左右摆，边缘不再是几何形状
        const wx = (fbm(u * 3.2 + seed, v * 2.1, seed + 11, 3) - 0.5) * 0.16
        const uu = u + wx

        // 三条火舌叠加：底部合并成一根，越往上越散开、越细
        const spread = 0.18 + yy * 0.95
        const l1 = (fbm(v * 1.7, seed * 0.3, seed + 21, 2) - 0.5) * 0.36
        const l2 = (fbm(v * 2.4, seed * 0.5, seed + 31, 2) - 0.5) * 0.5
        const l3 = (fbm(v * 1.2, seed * 0.7, seed + 41, 2) - 0.5) * 0.62
        const wob = { w: 0.86 + yy * 1.5 }
        const g = (c: number, w: number) => {
          const d = (uu - (0.5 + c * spread)) / (w * wob.w)
          return Math.exp(-d * d * 2.1)
        }
        const lateral = g(l1, 0.075) + g(l2, 0.05) * 0.85 + g(l3, 0.038) * 0.7
        if (lateral < 0.005) return 0

        // 丝状断口：竖直拉伸的高频噪声，让火舌有撕裂、有缺口
        const fil = fbm(uu * 13 + seed * 2.2, v * 3.2 + seed * 0.4, seed + 51, 4)
        const fil2 = fbm(uu * 26 + seed * 1.7, v * 6.5, seed + 61, 3)
        const fireBreak = 0.34 + 0.5 * fil + 0.28 * fil2

        // 竖向包络：底部厚实、顶部收成细尖，两端都做软过渡
        const vert = Math.pow(smooth(0.04, 0.62, v), 0.9) * smooth(1, 0.9, v) * smooth(0, 0.05, v)
        const body = Math.min(1.25, lateral * fireBreak * vert * 1.15)

        // 底部白热核心
        const core = Math.pow(lateral, 3.2) * Math.pow(smooth(0.52, 1, v), 1.6) * 0.55
        return body + core
      })
    }
  },
  {
    id: 'spark',
    name: '火花',
    draw: (ctx, size, p) => {
      pixelAlpha(ctx, size, (u, v) => {
        const dx = (u - 0.5) / 0.5
        const dy = (v - 0.5) / 0.18
        const d = Math.sqrt(dx * dx * 0.55 + dy * dy)
        if (d > 1) return 0
        const core = Math.pow(1 - d, 2.4)
        const head = Math.exp(-Math.pow((u - 0.72) * 6, 2))
        return Math.min(1, core * (0.8 + head * 0.9))
      })
    }
  },
  {
    id: 'star',
    name: '星芒',
    draw: (ctx, size) => {
      pixelAlpha(ctx, size, (u, v) => {
        const dx = Math.abs(u - 0.5) * 2
        const dy = Math.abs(v - 0.5) * 2
        const glow = Math.pow(Math.max(0, 1 - Math.hypot(dx, dy)), 3)
        const rayH = Math.pow(Math.max(0, 1 - dx), 2.4) * Math.pow(Math.max(0, 1 - dy * 6), 1.4)
        const rayV = Math.pow(Math.max(0, 1 - dy), 2.4) * Math.pow(Math.max(0, 1 - dx * 6), 1.4)
        const diag = 0.4 * Math.pow(Math.max(0, 1 - (dx + dy) / 1.15), 3)
        return Math.min(1, glow * 0.8 + rayH * 0.85 + rayV * 0.85 + diag)
      })
    }
  },
  {
    id: 'ring',
    name: '光环',
    draw: (ctx, size, p) => {
      pixelAlpha(ctx, size, (u, v) => {
        const d = Math.hypot(u - 0.5, v - 0.5) * 2
        const w = 0.07 + p.softness * 0.12
        return Math.max(0, 1 - Math.abs(d - 0.78) / w)
      })
    }
  },
  {
    id: 'magicCircle',
    name: '法阵',
    draw: (ctx, size) => {
      const s = size
      const cx = s / 2
      ctx.strokeStyle = '#ffffff'
      ctx.fillStyle = '#ffffff'
      ctx.globalCompositeOperation = 'lighter'
      const ring = (r: number, w: number, dash?: number[]) => {
        ctx.lineWidth = w * s
        ctx.beginPath()
        ctx.arc(cx, cx, r * s, 0, Math.PI * 2)
        ctx.stroke()
      }
      ring(0.44, 0.006)
      ring(0.41, 0.002)
      ring(0.3, 0.008)
      ring(0.2, 0.003)
      ring(0.06, 0.012)
      // 六芒星
      ctx.lineWidth = 0.006 * s
      for (let k = 0; k < 2; k++) {
        ctx.beginPath()
        for (let i = 0; i < 3; i++) {
          const ang = (i * Math.PI * 2) / 3 + (k ? Math.PI : 0) - Math.PI / 2
          const x = cx + Math.cos(ang) * 0.34 * s
          const y = cx + Math.sin(ang) * 0.34 * s
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.stroke()
      }
      // 刻度
      for (let i = 0; i < 48; i++) {
        const ang = (i / 48) * Math.PI * 2
        const r0 = 0.41 * s
        const r1 = i % 4 === 0 ? 0.37 * s : 0.395 * s
        ctx.lineWidth = (i % 4 === 0 ? 0.005 : 0.0025) * s
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(ang) * r0, cx + Math.sin(ang) * r0)
        ctx.lineTo(cx + Math.cos(ang) * r1, cx + Math.sin(ang) * r1)
        ctx.stroke()
      }
      // 符文块
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2
        const r = 0.34 * s
        ctx.save()
        ctx.translate(cx + Math.cos(ang) * r, cx + Math.sin(ang) * r)
        ctx.rotate(ang + Math.PI / 2)
        ctx.lineWidth = 0.004 * s
        ctx.strokeRect(-0.016 * s, -0.02 * s, 0.032 * s, 0.04 * s)
        ctx.beginPath()
        ctx.moveTo(-0.01 * s, -0.008 * s)
        ctx.lineTo(0.008 * s, 0.012 * s)
        ctx.stroke()
        ctx.restore()
      }
      ctx.globalCompositeOperation = 'source-over'
    }
  },
  {
    id: 'noise',
    name: '噪波',
    draw: (ctx, size, p) => {
      const img = ctx.createImageData(size, size)
      const d = img.data
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n = fbm((x / size) * 6, (y / size) * 6, p.seed, 5)
          const v = Math.round(Math.min(1, Math.max(0, (n - 0.5) * 1.6 + 0.5)) * 255)
          const i = (y * size + x) * 4
          d[i] = d[i + 1] = d[i + 2] = v
          d[i + 3] = 255
        }
      }
      ctx.putImageData(img, 0, 0)
    }
  },
  {
    id: 'shard',
    name: '碎片',
    draw: (ctx, size) => {
      const s = size
      ctx.beginPath()
      ctx.moveTo(s * 0.5, s * 0.04)
      ctx.lineTo(s * 0.82, s * 0.42)
      ctx.lineTo(s * 0.62, s * 0.96)
      ctx.lineTo(s * 0.3, s * 0.66)
      ctx.lineTo(s * 0.18, s * 0.3)
      ctx.closePath()
      const g = ctx.createLinearGradient(0, 0, s, s)
      g.addColorStop(0, 'rgba(255,255,255,0.95)')
      g.addColorStop(1, 'rgba(255,255,255,0.25)')
      ctx.fillStyle = g
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,1)'
      ctx.lineWidth = s * 0.012
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(s * 0.5, s * 0.06)
      ctx.lineTo(s * 0.5, s * 0.9)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = s * 0.005
      ctx.stroke()
    }
  },
  {
    id: 'bolt',
    name: '电弧',
    draw: (ctx, size, p) => {
      const s = size
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#ffffff'
      ctx.shadowColor = '#ffffff'
      ctx.shadowBlur = s * 0.05
      for (let b = 0; b < 2; b++) {
        let x = s * 0.5
        ctx.beginPath()
        ctx.moveTo(x, s * 0.02)
        for (let i = 1; i <= 12; i++) {
          x += (hash2(i, b, p.seed) - 0.5) * s * 0.09
          ctx.lineTo(x, (i / 12) * s * 0.98)
        }
        ctx.lineWidth = s * 0.016
        ctx.stroke()
        ctx.lineWidth = s * 0.004
        ctx.stroke()
      }
      ctx.shadowBlur = 0
    }
  },
  {
    id: 'leaf',
    name: '叶形',
    draw: (ctx, size) => {
      const s = size
      ctx.beginPath()
      ctx.ellipse(s * 0.5, s * 0.5, s * 0.18, s * 0.44, 0, 0, Math.PI * 2)
      const g = ctx.createLinearGradient(0, 0, 0, s)
      g.addColorStop(0, 'rgba(255,255,255,0.9)')
      g.addColorStop(1, 'rgba(255,255,255,0.45)')
      ctx.fillStyle = g
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = s * 0.01
      ctx.beginPath()
      ctx.moveTo(s * 0.5, s * 0.06)
      ctx.lineTo(s * 0.5, s * 0.94)
      ctx.stroke()
    }
  }
]

const genMap = new Map(GENERATORS.map((g) => [g.id, g]))

const canvasCache = new Map<string, HTMLCanvasElement>()

export function getCanvas(gen: string, params: Params, size = 512): HTMLCanvasElement {
  const key = `${gen}|${params.seed}|${params.contrast}|${params.softness}|${size}`
  const hit = canvasCache.get(key)
  if (hit) return hit
  const def = genMap.get(gen) || genMap.get('glow')!
  const [cv, ctx] = makeCanvas(size)
  def.draw(ctx, size, params)
  canvasCache.set(key, cv)
  return cv
}

export function canvasToDataURL(gen: string, params: Params, size = 256): string {
  return getCanvas(gen, params, size).toDataURL('image/png')
}

/* ---------------- three 纹理缓存 ---------------- */
const texCache = new Map<string, THREE.Texture>()
const loader = new THREE.TextureLoader()

export function getTexture(
  asset: { id: string; gen: string; dataUrl?: string; params: Params } | undefined
): THREE.Texture {
  const fallbackKey = '__fallback'
  if (!asset) {
    if (!texCache.has(fallbackKey)) {
      const cv = getCanvas('glow', { seed: 1, contrast: 1, softness: 0.5 }, 128)
      const t = new THREE.CanvasTexture(cv)
      t.colorSpace = THREE.SRGBColorSpace
      texCache.set(fallbackKey, t)
    }
    return texCache.get(fallbackKey)!
  }
  const key = `${asset.id}|${asset.gen}|${asset.params?.seed}|${asset.dataUrl ? 'img' : 'gen'}`
  const hit = texCache.get(key)
  if (hit) return hit

  let texture: THREE.Texture
  if (asset.dataUrl) {
    texture = loader.load(asset.dataUrl)
  } else {
    // 火焰贴图细节多，单独用更高分辨率，避免叠大后糊成一块
    const res = asset.gen === 'flame' ? 1024 : 512
    texture = new THREE.CanvasTexture(getCanvas(asset.gen, asset.params, res))
  }
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.anisotropy = 1
  texture.needsUpdate = true
  texCache.set(key, texture)
  return texture
}

export function purgeTextureCache() {
  for (const t of texCache.values()) t.dispose()
  texCache.clear()
}
