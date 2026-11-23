import * as THREE from 'three'

type Params = { seed: number; contrast: number; softness: number; variant?: number }

/** 变形用的确定性随机：同一 gen + variant 永远得到同一组参数 */
function vr(variant: number, k: number): number {
  return hash2(variant + 7, k * 31, variant * 13 + 1024)
}

/** 变形 0 = 原版 */
export const VARIANT_COUNT = 24

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
    draw: (ctx, size, p) => {
      const vi = p.variant ?? 0
      const pw = 2.2 + p.softness * 2 + (vi ? vr(vi, 1) * 1.5 - 0.5 : 0)
      const ax = vi ? 0.9 + vr(vi, 2) * 0.2 : 1
      const ay = vi ? 0.9 + vr(vi, 3) * 0.2 : 1
      pixelAlpha(ctx, size, (u, v) => {
        const dx = (u - 0.5) / ax
        const dy = (v - 0.5) / ay
        const d = Math.hypot(dx, dy) / 0.5
        return d >= 1 ? 0 : Math.pow(1 - d, pw)
      })
    }
  },
  {
    id: 'dot',
    name: '圆点',
    draw: (ctx, size, p) => {
      const vi = p.variant ?? 0
      const rad = vi ? 0.32 + vr(vi, 1) * 0.14 : 0.42
      const edge = vi ? 6 + vr(vi, 2) * 14 : 12
      const ax = vi ? 0.9 + vr(vi, 3) * 0.2 : 1
      const ay = vi ? 0.9 + vr(vi, 4) * 0.2 : 1
      pixelAlpha(ctx, size, (u, v) => {
        const d = Math.hypot((u - 0.5) / ax, (v - 0.5) / ay)
        return d > rad ? 0 : Math.min(1, (rad - d) * edge)
      })
    }
  },
  {
    id: 'smoke',
    name: '烟雾',
    draw: (ctx, size, p) => {
      const vi = p.variant ?? 0
      const seed = p.seed
      const soft = p.softness
      // 变形：絮状结构的尺度、翻滚方向与边界厚度都换一套
      const fBig = vi ? 2.6 + vr(vi, 1) * 2.4 : 3.6
      const fFine = vi ? 5.6 + vr(vi, 2) * 4 : 7.4
      const lobeX = vi ? -0.8 + vr(vi, 3) * 1.4 : -0.8
      const lobeY = vi ? 0.7 + vr(vi, 4) * 1.2 : 0.7
      const edgeAmp = vi ? 0.26 + vr(vi, 5) * 0.24 : 0.34
      pixelAlpha(ctx, size, (u, v) => {
        const dx = u - 0.5
        const dy = v - 0.5
        const r = Math.sqrt(dx * dx + dy * dy)
        // 不规则边界：让烟团轮廓被噪声顶开，不再是标准圆
        const edgeN = fbm(u * 3.4 + seed * 0.7, v * 3.4 + seed * 0.4, seed + 17, 3)
        const mask = Math.max(0, 1 - r / (0.5 * (0.86 + edgeN * edgeAmp)))
        if (mask <= 0) return 0
        const nBig = fbm(u * fBig + seed * 0.3, v * fBig, seed, 4)
        const nFine = fbm(u * fFine + seed * 1.1, v * fFine + seed * 0.5, seed + 9, 4)
        // 两层噪声 + 偏移双叶，才有翻滚的絮状结构
        const lobe = fbm(u * 2.2 + lobeX, v * 2.2 + lobeY, seed + 23, 3)
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
      const vi = p.variant ?? 0
      // 变形：摆动幅度 / 火舌散开度 / 宽度 / 丝状频率 / 白热强度各换一套
      const warpAmp = vi ? 0.1 + vr(vi, 1) * 0.16 : 0.16
      const spreadMul = vi ? 0.78 + vr(vi, 2) * 0.6 : 1
      const widthMul = vi ? 0.85 + vr(vi, 3) * 0.55 : 1
      const filFreq = vi ? 9 + vr(vi, 4) * 9 : 13
      const coreAmp = vi ? 0.42 + vr(vi, 6) * 0.3 : 0.55
      const leanK = vi ? (vr(vi, 7) - 0.5) * 0.5 : 0
      const smooth = (a: number, b: number, x: number) => {
        const u = Math.max(0, Math.min(1, (x - a) / (b - a)))
        return u * u * (3 - 2 * u)
      }
      pixelAlpha(ctx, size, (u, v) => {
        const yy = 1 - v // 0 = 顶部, 1 = 底部
        // 域扭曲：整条火舌会随高度左右摆，边缘不再是几何形状
        const wx = (fbm(u * 3.2 + seed, v * 2.1, seed + 11, 3) - 0.5) * warpAmp
        const uu = u + wx

        // 三条火舌叠加：底部合并成一根，越往上越散开、越细
        const spread = (0.18 + yy * 0.95) * spreadMul
        const l1 = (fbm(v * 1.7, seed * 0.3, seed + 21, 2) - 0.5) * 0.36 + leanK * yy
        const l2 = (fbm(v * 2.4, seed * 0.5, seed + 31, 2) - 0.5) * 0.5 + leanK * yy * 0.6
        const l3 = (fbm(v * 1.2, seed * 0.7, seed + 41, 2) - 0.5) * 0.62 - leanK * yy * 0.4
        const wob = { w: (0.86 + yy * 1.5) * widthMul }
        const g = (c: number, w: number) => {
          const d = (uu - (0.5 + c * spread)) / (w * wob.w)
          return Math.exp(-d * d * 2.1)
        }
        const lateral = g(l1, 0.075) + g(l2, 0.05) * 0.85 + g(l3, 0.038) * 0.7
        if (lateral < 0.005) return 0

        // 丝状断口：竖直拉伸的高频噪声，让火舌有撕裂、有缺口
        const fil = fbm(uu * filFreq + seed * 2.2, v * 3.2 + seed * 0.4, seed + 51, 4)
        const fil2 = fbm(uu * filFreq * 2 + seed * 1.7, v * 6.5, seed + 61, 3)
        const fireBreak = 0.34 + 0.5 * fil + 0.28 * fil2

        // 竖向包络：底部厚实、顶部收成细尖，两端都做软过渡
        const vert = Math.pow(smooth(0.04, 0.62, v), 0.9) * smooth(1, 0.9, v) * smooth(0, 0.05, v)
        const body = Math.min(1.25, lateral * fireBreak * vert * 1.15)

        // 底部白热核心
        const core = Math.pow(lateral, 3.2) * Math.pow(smooth(0.52, 1, v), 1.6) * coreAmp
        return body + core
      })
    }
  },
  {
    id: 'spark',
    name: '火花',
    draw: (ctx, size, p) => {
      const vi = p.variant ?? 0
      const ang = vi ? (vr(vi, 1) - 0.5) * 1.4 : 0
      const ca = Math.cos(ang)
      const sa = Math.sin(ang)
      const thin = vi ? 0.12 + vr(vi, 2) * 0.1 : 0.18
      const headX = vi ? 0.62 + vr(vi, 3) * 0.2 : 0.72
      pixelAlpha(ctx, size, (u, v) => {
        // 旋转到变形角度，让火星拖尾朝不同方向
        const du = u - 0.5
        const dv = v - 0.5
        const ru = du * ca - dv * sa
        const rv = du * sa + dv * ca
        const dx = ru / 0.5
        const dy = rv / thin
        const d = Math.sqrt(dx * dx * 0.55 + dy * dy)
        if (d > 1) return 0
        const core = Math.pow(1 - d, 2.4)
        const head = Math.exp(-Math.pow((ru + 0.5 - headX) * 6, 2))
        return Math.min(1, core * (0.8 + head * 0.9))
      })
    }
  },
  {
    id: 'star',
    name: '星芒',
    draw: (ctx, size, p) => {
      const vi = p.variant ?? 0
      const arms = vi ? 3 + (vi % 5) : 4
      const rot = vi ? vr(vi, 1) * 0.7 : 0
      pixelAlpha(ctx, size, (u, v) => {
        const dx = (u - 0.5) * 2
        const dy = (v - 0.5) * 2
        const r = Math.hypot(dx, dy)
        if (!vi) {
          const glow = Math.pow(Math.max(0, 1 - r), 3)
          const rayH = Math.pow(Math.max(0, 1 - Math.abs(dx)), 2.4) * Math.pow(Math.max(0, 1 - Math.abs(dy) * 6), 1.4)
          const rayV = Math.pow(Math.max(0, 1 - Math.abs(dy)), 2.4) * Math.pow(Math.max(0, 1 - Math.abs(dx) * 6), 1.4)
          const diag = 0.4 * Math.pow(Math.max(0, 1 - (Math.abs(dx) + Math.abs(dy)) / 1.15), 3)
          return Math.min(1, glow * 0.8 + rayH * 0.85 + rayV * 0.85 + diag)
        }
        // 变形：改成任意条数、任意角度的辐射芒
        const glow = Math.pow(Math.max(0, 1 - r), 3)
        const ang = Math.atan2(dy, dx) + rot
        const spoke = Math.pow(Math.max(0, Math.cos(ang * arms)), 10) * Math.pow(Math.max(0, 1 - r), 1.5)
        const halo = Math.pow(Math.max(0, 1 - r * 2.4), 2)
        return Math.min(1, glow * 0.7 + spoke * 1.6 + halo * 0.35)
      })
    }
  },
  {
    id: 'ring',
    name: '光环',
    draw: (ctx, size, p) => {
      const vi = p.variant ?? 0
      const radius = vi ? 0.62 + vr(vi, 1) * 0.3 : 0.78
      const width = vi ? 0.04 + vr(vi, 2) * 0.16 : null
      const second = vi ? vr(vi, 3) * 0.5 : 0
      const dash = vi ? 6 + Math.floor(vr(vi, 4) * 26) : 0
      pixelAlpha(ctx, size, (u, v) => {
        const d = Math.hypot(u - 0.5, v - 0.5) * 2
        const w = width ?? 0.07 + p.softness * 0.12
        let a = Math.max(0, 1 - Math.abs(d - radius) / w)
        if (dash) {
          const ang = Math.atan2(v - 0.5, u - 0.5)
          const seg = Math.cos(ang * dash) > 0.2 ? 1 : 0
          a *= seg ? 1 : 0.25
        }
        if (second) a = Math.max(a, Math.max(0, 1 - Math.abs(d - radius * 0.72) / w) * second)
        return a
      })
    }
  },
  {
    id: 'magicCircle',
    name: '法阵',
    draw: (ctx, size, p) => {
      const s = size
      const cx = s / 2
      const vi = p.variant ?? 0
      const rot = vi ? vr(vi, 1) * Math.PI * 2 : 0
      const sides = vi ? 3 + (vi % 4) : 3
      const ticks = vi ? 24 + Math.floor(vr(vi, 2) * 40) : 48
      const runes = vi ? 6 + Math.floor(vr(vi, 3) * 10) : 12
      const outer = vi ? 0.44 - vr(vi, 4) * 0.05 : 0.44
      ctx.strokeStyle = '#ffffff'
      ctx.fillStyle = '#ffffff'
      ctx.globalCompositeOperation = 'lighter'
      const ring = (r: number, w: number) => {
        ctx.lineWidth = w * s
        ctx.beginPath()
        ctx.arc(cx, cx, r * s, 0, Math.PI * 2)
        ctx.stroke()
      }
      ring(outer, 0.006)
      ring(outer - 0.03, 0.002)
      ring(0.3, vi ? 0.005 + vr(vi, 5) * 0.006 : 0.008)
      ring(0.2, 0.003)
      ring(0.06, 0.012)
      // 内圈星形：原版六芒星，变形换成任意边数
      ctx.lineWidth = 0.006 * s
      for (let k = 0; k < 2; k++) {
        ctx.beginPath()
        for (let i = 0; i < sides; i++) {
          const ang = (i * Math.PI * 2) / sides + (k ? Math.PI / sides : 0) - Math.PI / 2 + rot
          const x = cx + Math.cos(ang) * 0.34 * s
          const y = cx + Math.sin(ang) * 0.34 * s
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.stroke()
      }
      // 刻度
      for (let i = 0; i < ticks; i++) {
        const ang = (i / ticks) * Math.PI * 2 + rot
        const r0 = (outer - 0.03) * s
        const r1 = i % 4 === 0 ? (outer - 0.07) * s : (outer - 0.045) * s
        ctx.lineWidth = (i % 4 === 0 ? 0.005 : 0.0025) * s
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(ang) * r0, cx + Math.sin(ang) * r0)
        ctx.lineTo(cx + Math.cos(ang) * r1, cx + Math.sin(ang) * r1)
        ctx.stroke()
      }
      // 符文块
      for (let i = 0; i < runes; i++) {
        const ang = (i / runes) * Math.PI * 2 + rot
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
      const vi = p.variant ?? 0
      const freq = vi ? 3 + vr(vi, 1) * 9 : 6
      const oct = vi ? 3 + Math.floor(vr(vi, 2) * 4) : 5
      const cont = vi ? 1.2 + vr(vi, 3) * 0.9 : 1.6
      const img = ctx.createImageData(size, size)
      const d = img.data
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n = fbm((x / size) * freq, (y / size) * freq, p.seed, oct)
          const v = Math.round(Math.min(1, Math.max(0, (n - 0.5) * cont + 0.5)) * 255)
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
    draw: (ctx, size, p) => {
      const s = size
      const vi = p.variant ?? 0
      const rot = vi ? vr(vi, 1) * Math.PI * 2 : 0
      const segs = vi ? 4 + (vi % 4) : 5
      const stretch = vi ? 0.55 + vr(vi, 2) * 0.5 : 1
      ctx.save()
      ctx.translate(s / 2, s / 2)
      ctx.rotate(rot)
      ctx.scale(1, stretch)
      if (!vi) {
        ctx.beginPath()
        ctx.moveTo(0, -s * 0.46)
        ctx.lineTo(s * 0.32, -s * 0.1)
        ctx.lineTo(s * 0.12, s * 0.46)
        ctx.lineTo(-s * 0.2, s * 0.16)
        ctx.lineTo(-s * 0.32, -s * 0.2)
        ctx.closePath()
      } else {
        // 变形：随机多边形碎片，顶点带半径抖动
        ctx.beginPath()
        for (let i = 0; i < segs; i++) {
          const ang = (i / segs) * Math.PI * 2 - Math.PI / 2 + vr(vi, 10 + i) * 0.4
          const r = (0.3 + vr(vi, 20 + i) * 0.16) * s
          const x = Math.cos(ang) * r
          const y = Math.sin(ang) * r
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
      }
      const g = ctx.createLinearGradient(-s * 0.5, -s * 0.5, s * 0.5, s * 0.5)
      g.addColorStop(0, 'rgba(255,255,255,0.95)')
      g.addColorStop(1, 'rgba(255,255,255,0.25)')
      ctx.fillStyle = g
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,1)'
      ctx.lineWidth = s * 0.012
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.42)
      ctx.lineTo(0, s * 0.4)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = s * 0.005
      ctx.stroke()
      ctx.restore()
    }
  },
  {
    id: 'bolt',
    name: '电弧',
    draw: (ctx, size, p) => {
      const s = size
      const vi = p.variant ?? 0
      const branches = vi ? 1 + Math.floor(vr(vi, 1) * 3) : 2
      const amp = vi ? 0.04 + vr(vi, 2) * 0.12 : 0.09
      const steps = vi ? 6 + Math.floor(vr(vi, 3) * 12) : 12
      const rot = vi ? vr(vi, 4) * Math.PI : 0
      ctx.save()
      ctx.translate(s / 2, s / 2)
      ctx.rotate(rot)
      ctx.translate(-s / 2, -s / 2)
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#ffffff'
      ctx.shadowColor = '#ffffff'
      ctx.shadowBlur = s * (vi ? 0.03 + vr(vi, 5) * 0.04 : 0.05)
      for (let b = 0; b < branches; b++) {
        const offset = vi ? (vr(vi, 30 + b) - 0.5) * s * 0.4 : 0
        let x = s * 0.5 + offset
        ctx.beginPath()
        ctx.moveTo(x, s * 0.02)
        for (let i = 1; i <= steps; i++) {
          x += (hash2(i, b, p.seed) - 0.5) * s * amp * 1.6
          ctx.lineTo(x, (i / steps) * s * 0.98)
        }
        ctx.lineWidth = s * (vi ? 0.01 + vr(vi, 40 + b) * 0.012 : 0.016)
        ctx.stroke()
        ctx.lineWidth = s * 0.004
        ctx.stroke()
      }
      ctx.shadowBlur = 0
      ctx.restore()
    }
  },
  {
    id: 'leaf',
    name: '叶形',
    draw: (ctx, size, p) => {
      const s = size
      const vi = p.variant ?? 0
      const rot = vi ? vr(vi, 1) * Math.PI * 2 : 0
      const w = vi ? 0.1 + vr(vi, 2) * 0.12 : 0.18
      const hgt = vi ? 0.32 + vr(vi, 3) * 0.16 : 0.44
      const serr = vi ? Math.floor(vr(vi, 4) * 4) : 0
      ctx.save()
      ctx.translate(s / 2, s / 2)
      ctx.rotate(rot)
      if (serr) {
        // 变形：带锯齿边缘的叶片
        ctx.beginPath()
        const steps = serr * 4
        for (let i = 0; i <= steps; i++) {
          const t = i / steps
          const ang = t * Math.PI * 2
          const k = i % 4 === 1 || i % 4 === 3 ? 0.92 : 1.12
          const x = Math.cos(ang) * w * s * k
          const y = Math.sin(ang) * hgt * s * k
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
      } else {
        ctx.beginPath()
        ctx.ellipse(0, 0, s * w, s * hgt, 0, 0, Math.PI * 2)
      }
      const g = ctx.createLinearGradient(0, -s * hgt, 0, s * hgt)
      g.addColorStop(0, 'rgba(255,255,255,0.9)')
      g.addColorStop(1, 'rgba(255,255,255,0.45)')
      ctx.fillStyle = g
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = s * 0.01
      ctx.beginPath()
      ctx.moveTo(0, -s * hgt * 0.92)
      ctx.lineTo(0, s * hgt * 0.92)
      ctx.stroke()
      ctx.restore()
    }
  },
  {
    id: 'flash',
    name: '爆闪',
    draw: (ctx, size, p) => {
      const vi = p.variant ?? 0
      const arms = vi ? 3 + Math.floor(vr(vi, 1) * 5) : 4
      const rot = vi ? vr(vi, 2) * 0.9 : 0
      const coreR = vi ? 0.1 + vr(vi, 3) * 0.12 : 0.15
      const rayLen = vi ? 0.62 + vr(vi, 4) * 0.5 : 1
      const ax = vi ? 0.92 + vr(vi, 5) * 0.3 : 1
      const ay = vi ? 0.92 + vr(vi, 6) * 0.3 : 1
      pixelAlpha(ctx, size, (u, v) => {
        const dx = ((u - 0.5) * 2) / ax
        const dy = ((v - 0.5) * 2) / ay
        const r = Math.hypot(dx, dy)
        if (r > 1.2) return 0
        const core = Math.pow(Math.max(0, 1 - r / (coreR * 2.6)), 3.2)
        const ang = Math.atan2(dy, dx) + rot
        // 放射芒：cos(arms·θ) 的高次幂，形成 2·arms 根细尖
        const ray = Math.pow(Math.max(0, Math.cos(ang * arms)), 5) * Math.pow(Math.max(0, 1 - r / rayLen), 2.2)
        const halo = Math.pow(Math.max(0, 1 - r), 2.8) * 0.42
        return Math.min(1.5, core * 1.5 + ray * 1.2 + halo)
      })
    }
  },
  {
    id: 'beam',
    name: '光束',
    draw: (ctx, size, p) => {
      const seed = p.seed
      const vi = p.variant ?? 0
      const width = vi ? 0.055 + vr(vi, 1) * 0.12 : 0.12
      const stripes = vi ? 4 + Math.floor(vr(vi, 2) * 10) : 8
      const lean = vi ? (vr(vi, 3) - 0.5) * 0.26 : 0
      const waist = vi ? 0.25 + vr(vi, 4) * 0.5 : 0.5
      const twin = vi ? vr(vi, 5) > 0.45 : false
      const wobK = vi ? 0.02 + vr(vi, 6) * 0.05 : 0.04
      const body = (uu: number, env: number) => {
        const g = Math.exp(-Math.pow((uu - 0.5) / (width * (0.5 + env * 0.9)), 2) * 1.7)
        if (g < 0.004) return 0
        const st = 0.5 + 0.5 * Math.sin((uu - 0.5) * stripes * 44 + fbm(uu * 4, 0.3, seed + 13, 3) * 6.28)
        return g * (0.72 + st * 0.5) * env + Math.pow(g, 2.6) * 0.75
      }
      pixelAlpha(ctx, size, (u, v) => {
        const yy = 1 - v
        const wob = (fbm(v * 2.6, seed * 0.3, seed + 7, 3) - 0.5) * wobK * 2 + lean * (yy - 0.5)
        const uu = u + wob
        // 纵向包络：两端收成尖，腰部可鼓
        const env = Math.pow(Math.sin(Math.min(1, Math.max(0, yy)) * Math.PI), 1 - waist * 0.6)
        let a = body(uu, env)
        if (twin) a += body(uu + 0.26, env) * 0.55
        return a
      })
    }
  },
  {
    id: 'spiral',
    name: '漩涡',
    draw: (ctx, size, p) => {
      const vi = p.variant ?? 0
      const arms = vi ? 2 + (vi % 3) : 3
      const turns = vi ? 1.1 + vr(vi, 1) * 1.7 : 1.8
      const dir = vi && vr(vi, 2) > 0.5 ? -1 : 1
      const thick = vi ? 0.012 + vr(vi, 3) * 0.026 : 0.03
      const spin = vi ? vr(vi, 4) * Math.PI * 2 : 0
      const soft = 1.2 + p.softness
      pixelAlpha(ctx, size, (u, v) => {
        const dx = u - 0.5
        const dy = v - 0.5
        const r = Math.hypot(dx, dy) * 2 // 0..1（贴边）
        if (r < 0.02 || r > 1) return 0
        const th = Math.atan2(dy, dx)
        let best = 0
        for (let a = 0; a < arms; a++) {
          // 阿基米德螺线：期望角随半径线性增长
          const base = (a / arms) * Math.PI * 2 + spin
          const expect = base + dir * r * turns * Math.PI * 2
          let dAng = th - expect
          dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng))
          const arc = Math.abs(dAng) * r * 0.5 // 换算成贴图坐标的弧长
          const w = thick * (1 - r * 0.55 + 0.12)
          const k = Math.exp(-Math.pow(arc / w, 2) * soft)
          if (k > best) best = k
        }
        const fade = Math.pow(Math.max(0, 1 - r), 0.75) * Math.pow(Math.min(1, r * 6), 0.6)
        const hub = Math.pow(Math.max(0, 1 - r / 0.22), 2.6) * 0.7
        return Math.min(1.2, best * fade * 1.15 + hub)
      })
    }
  },
  {
    id: 'bubble',
    name: '气泡',
    draw: (ctx, size, p) => {
      const vi = p.variant ?? 0
      // 半径以画布坐标（0.5 = 边）为单位
      const R = vi ? 0.2 + vr(vi, 1) * 0.13 : 0.29
      const w = vi ? 0.008 + vr(vi, 2) * 0.02 : 0.016
      const hx = R * (vi ? -0.4 - vr(vi, 3) * 0.2 : -0.5)
      const hy = R * (vi ? -0.45 - vr(vi, 4) * 0.2 : -0.55)
      const innerK = vi ? vr(vi, 5) * 0.5 : 0.18
      const second = vi ? vr(vi, 6) : 0.5
      const ax = vi ? 0.9 + vr(vi, 7) * 0.2 : 1
      pixelAlpha(ctx, size, (u, v) => {
        const dx = (u - 0.5) / ax
        const dy = v - 0.5
        const r = Math.hypot(dx, dy)
        // 空心环：膜边亮、内部几乎透明，才有「泡」的读感
        const ring = Math.exp(-Math.pow((r - R) / w, 2) * 1.6)
        const skin = Math.max(0, 1 - Math.abs(r - R) / (w * 4.2)) * innerK
        const hiA = Math.exp(-(Math.pow((dx - hx) * 13, 2) + Math.pow((dy - hy) * 15, 2)))
        const hiB = Math.exp(-(Math.pow((dx + hx * 0.6) * 26, 2) + Math.pow((dy + hy * 0.55) * 30, 2))) * 0.5
        let a = Math.min(1.25, ring * 1.18 + skin * 0.55 + (hiA + hiB) * 1.0)
        if (second > 0.2) {
          const sd = Math.hypot(dx - R * 0.82, dy - R * 0.86)
          const sR = R * 0.24
          a = Math.max(a, Math.exp(-Math.pow((sd - sR) / (w * 0.8), 2) * 1.6) * 0.95)
        }
        return a
      })
    }
  },
  {
    id: 'dust',
    name: '尘粒',
    draw: (ctx, size, p) => {
      const s = size
      const vi = p.variant ?? 0
      const count = vi ? 50 + Math.floor(vr(vi, 1) * 120) : 80
      const rMin = vi ? 0.004 + vr(vi, 2) * 0.008 : 0.006
      const rMax = vi ? 0.014 + vr(vi, 3) * 0.03 : 0.022
      const bias = vi ? 0.25 + vr(vi, 4) * 0.9 : 0.6
      const spreadR = vi ? 0.28 + vr(vi, 5) * 0.22 : 0.4
      const seed = p.seed
      // 底噪：让颗粒落在稀薄的尘雾里，不是纯撒点
      pixelAlpha(ctx, size, (u, v) => {
        const r = Math.hypot(u - 0.5, v - 0.5) * 2
        const cl = fbm(u * 3.6 + seed, v * 3.6, seed + 5, 3)
        const mask = Math.max(0, 1 - r / (0.62 + cl * 0.4))
        return Math.pow(cl, 2.4) * mask * 0.32
      })
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < count; i++) {
        const a = hash2(i, 1, seed) * Math.PI * 2
        const rr = Math.pow(hash2(i, 2, seed), 0.55 + bias * 0.4) * spreadR
        const x = (0.5 + Math.cos(a) * rr * 1.0) * s
        const y = (0.5 + Math.sin(a) * rr * 1.0) * s
        const rad = (rMin + hash2(i, 3, seed) * (rMax - rMin)) * s
        const al = 0.35 + hash2(i, 4, seed) * 0.6
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 3.2)
        g.addColorStop(0, `rgba(255,255,255,${al})`)
        g.addColorStop(0.4, `rgba(255,255,255,${al * 0.5})`)
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, rad * 3.2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
    }
  },
  {
    id: 'slash',
    name: '刀光',
    draw: (ctx, size, p) => {
      const vi = p.variant ?? 0
      const span = vi ? 0.5 + vr(vi, 1) * 1.3 : 1.05 // 弧度半张角
      const tilt = vi ? (vr(vi, 2) - 0.5) * 1.2 : -0.5
      // 半径以「半个画布」为单位：0.3 左右，弧带才落在画面内
      const R = vi ? 0.26 + vr(vi, 3) * 0.1 : 0.3
      const thick = vi ? 0.02 + vr(vi, 4) * 0.05 : 0.045
      const offset = vi ? 0.05 + vr(vi, 5) * 0.05 : 0.07
      const sharp = vi ? 0.6 + vr(vi, 6) : 1
      pixelAlpha(ctx, size, (u, v) => {
        const dx = u - 0.5
        const dy = v - 0.5
        const r = Math.hypot(dx, dy)
        let th = Math.atan2(dy, dx) - tilt
        th = Math.atan2(Math.sin(th), Math.cos(th))
        if (Math.abs(th) > span) return 0
        const t = Math.abs(th) / span // 0 = 弧中点，1 = 两端
        // 弧带：半径随角度外扩，两端渐细
        const center = R * (0.94 + t * 0.1)
        const w = thick * Math.pow(1 - t, 0.75 * sharp) + 0.008
        const band = Math.exp(-Math.pow((r - center) / w, 2) * 1.4)
        // 内侧亮边（刀锋）
        const edge = Math.exp(-Math.pow((r - center + offset * 0.5) / (w * 0.34), 2) * 2)
        return Math.min(1.3, band * 0.95 + edge * 0.6)
      })
    }
  },
  {
    id: 'cell',
    name: '能量网',
    draw: (ctx, size, p) => {
      const s = size
      const cx = s / 2
      const vi = p.variant ?? 0
      const n = vi ? 2 + Math.floor(vr(vi, 1) * 4) : 3 // 半径方向上的格数
      const rot = vi ? vr(vi, 2) * Math.PI / 3 : 0
      const lwid = vi ? 0.005 + vr(vi, 3) * 0.012 : 0.011
      const gap = vi ? vr(vi, 4) * 0.65 : 0.32 // 断线概率
      const dotK = vi ? 0.2 + vr(vi, 5) * 0.6 : 0.45
      const seed = p.seed
      const R = s * 0.47
      const a = (s * 0.44) / (n + 0.6) // 六边形外接半径
      const stepX = a * 1.5
      const stepY = a * Math.sqrt(3)

      ctx.save()
      ctx.translate(cx, cx)
      ctx.rotate(rot)
      // 底下垫一层中心亮、边缘暗的辉光，网格才有「能量」感
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R)
      g.addColorStop(0, 'rgba(255,255,255,0.16)')
      g.addColorStop(0.5, 'rgba(255,255,255,0.06)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, R, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = lwid * s
      ctx.shadowColor = 'rgba(255,255,255,0.75)'
      ctx.shadowBlur = s * 0.03
      ctx.lineCap = 'round'

      for (let row = -n; row <= n; row++) {
        for (let col = -n; col <= n; col++) {
          const x = col * stepX
          const y = row * stepY + (col % 2 ? stepY / 2 : 0)
          const d = Math.hypot(x, y)
          if (d > R - a * 0.5) continue
          const fade = Math.pow(Math.max(0, 1 - d / R), 0.6)
          for (let e = 0; e < 6; e++) {
            if (hash2(col * 11 + e, row * 17, seed) < gap) continue
            const a0 = (Math.PI / 3) * e
            const a1 = (Math.PI / 3) * (e + 1)
            ctx.globalAlpha = 0.9 * fade
            ctx.beginPath()
            ctx.moveTo(x + Math.cos(a0) * a, y + Math.sin(a0) * a)
            ctx.lineTo(x + Math.cos(a1) * a, y + Math.sin(a1) * a)
            ctx.stroke()
          }
          // 节点光点：不是每格都点，避免变成蜂窝板
          if (dotK > 0.3 && hash2(col * 3, row * 5, seed + 7) > 0.55) {
            ctx.globalAlpha = 0.55 * fade * dotK
            for (let e = 0; e < 6; e += 2) {
              const ang = (Math.PI / 3) * e
              ctx.beginPath()
              ctx.arc(x + Math.cos(ang) * a, y + Math.sin(ang) * a, lwid * s * 2.2, 0, Math.PI * 2)
              ctx.fillStyle = 'rgba(255,255,255,0.9)'
              ctx.fill()
            }
          }
        }
      }
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      ctx.restore()
    }
  },
  {
    id: 'rune',
    name: '符印',
    draw: (ctx, size, p) => {
      const s = size
      const cx = s / 2
      const vi = p.variant ?? 0
      const rot = vi ? vr(vi, 1) * Math.PI * 2 : 0
      const shape = vi ? Math.floor(vr(vi, 2) * 4) : 0 // 0 圆 1 六边 2 三角 3 方
      const strokes = vi ? 2 + Math.floor(vr(vi, 3) * 5) : 4
      const thick = vi ? 0.006 + vr(vi, 4) * 0.016 : 0.014
      const glowK = vi ? 0.2 + vr(vi, 5) * 0.6 : 0.45
      // 底光
      const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, s * 0.42)
      g.addColorStop(0, `rgba(255,255,255,${0.28 * glowK + 0.08})`)
      g.addColorStop(0.55, `rgba(255,255,255,${0.07 * glowK})`)
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, s, s)

      ctx.save()
      ctx.translate(cx, cx)
      ctx.rotate(rot)
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.shadowColor = 'rgba(255,255,255,0.8)'
      ctx.shadowBlur = s * 0.05 * (0.5 + glowK)
      ctx.lineJoin = 'round'
      // 外轮廓
      ctx.lineWidth = thick * 1.6 * s
      ctx.beginPath()
      const R = s * 0.3
      if (shape === 0) ctx.arc(0, 0, R, 0, Math.PI * 2)
      else {
        const sides = shape === 1 ? 6 : shape === 2 ? 3 : 4
        for (let i = 0; i <= sides; i++) {
          const ang = (i / sides) * Math.PI * 2 - Math.PI / 2
          const x = Math.cos(ang) * R
          const y = Math.sin(ang) * R
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
      }
      ctx.stroke()
      // 内部笔画：从端点连到随机方向，形成抽象符文
      ctx.lineWidth = thick * s
      for (let i = 0; i < strokes; i++) {
        const a0 = hash2(i, 1, p.seed) * Math.PI * 2
        const a1 = hash2(i, 2, p.seed) * Math.PI * 2
        const r0 = (0.3 + hash2(i, 3, p.seed) * 0.55) * R
        const r1 = (0.15 + hash2(i, 4, p.seed) * 0.7) * R
        ctx.beginPath()
        ctx.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0)
        ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1)
        ctx.stroke()
      }
      ctx.restore()
      ctx.shadowBlur = 0
    }
  },
  {
    id: 'flip',
    name: '序列帧',
    draw: (ctx, size, p) => {
      const vi = p.variant ?? 0
      const N = 4
      // 变种微调：火花的取向、拖尾厚度、核心亮度
      const rot = vi ? vr(vi, 1) * Math.PI : 0
      const arms = vi ? 3 + Math.floor(vr(vi, 2) * 3) : 5
      const thick = vi ? 0.6 + vr(vi, 3) * 0.8 : 1
      const coreK = vi ? 0.7 + vr(vi, 4) * 0.8 : 1
      pixelAlpha(ctx, size, (u, v) => {
        const cu = Math.floor(u * N)
        const cv = Math.floor(v * N)
        // canvas 顶行是第 0 帧，v 从下往上数，所以这里翻一下行号
        const row = N - 1 - cv
        const idx = row * N + cu
        const phase = idx / (N * N - 1)
        const lu = u * N - cu
        const lv = v * N - cv
        const dx = lu - 0.5
        const dy = lv - 0.5
        const rad = Math.hypot(dx, dy)
        const ang = Math.atan2(dy, dx) + rot

        // 扩散火环：半径随时间外推、越来越薄越来越淡
        const ringR = 0.07 + phase * 0.42
        const ringW = 0.03 + phase * 0.055
        const ring = Math.exp(-Math.pow((rad - ringR) / ringW, 2)) * (1 - phase * 0.75)

        // 放射臂：帧内保持同相位，避免逐帧跳变
        const spikes = Math.pow(Math.abs(Math.cos(ang * arms)), 8 * thick) * Math.max(0, 1 - rad / (0.42 + phase * 0.2))
        const spikeA = spikes * (0.55 + 0.45 * Math.sin(phase * Math.PI)) * (1 - phase * 0.6)

        // 中心白热核：前 1/3 帧最强，随后迅速熄灭
        const core = Math.max(0, 1 - phase * 3) * coreK * Math.pow(Math.max(0, 1 - rad / (0.18 + phase * 0.18)), 2.2)

        // 一点噪声让环边缘不规整
        const n = fbm(lu * 8 + p.seed, lv * 8 + idx * 0.7, p.seed + 31, 3)
        const grain = 0.75 + n * 0.35

        return Math.min(1, (ring * 0.95 + spikeA * 0.75 + core * 1.25) * grain)
      })
    }
  }
]

const genMap = new Map(GENERATORS.map((g) => [g.id, g]))

const canvasCache = new Map<string, HTMLCanvasElement>()

export function getCanvas(gen: string, params: Params, size = 512): HTMLCanvasElement {
  const key = `${gen}|${params.seed}|${params.contrast}|${params.softness}|${params.variant ?? 0}|${size}`
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
  const key = `${asset.id}|${asset.gen}|${asset.params?.seed}|${asset.params?.variant ?? 0}|${asset.dataUrl ? 'img' : 'gen'}`
  const hit = texCache.get(key)
  if (hit) return hit

  let texture: THREE.Texture
  if (asset.dataUrl) {
    texture = loader.load(asset.dataUrl)
  } else {
    // 火焰贴图细节多，单独用更高分辨率，避免叠大后糊成一块
    const res = asset.gen === 'flame' || asset.gen === 'flip' ? 1024 : 512
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
