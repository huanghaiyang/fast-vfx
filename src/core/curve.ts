import { Color } from 'three'
import type { Curve, Gradient, Keyframe, Track, Vec3 } from './types'

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u

export function evalCurve(curve: Curve | undefined, t: number): number {
  if (!curve || !curve.points.length) return 1
  const pts = curve.points
  t = clamp(t, 0, 1)
  if (t <= pts[0].t) return pts[0].v
  const last = pts[pts.length - 1]
  if (t >= last.t) return last.v
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t
      if (span < 1e-6) return b.v
      const u = (t - a.t) / span
      const s = u * u * (3 - 2 * u)
      return a.v + (b.v - a.v) * s
    }
  }
  return last.v
}

export function buildCurveLUT(curve: Curve | undefined, size = 64): Float32Array {
  const out = new Float32Array(size)
  for (let i = 0; i < size; i++) out[i] = evalCurve(curve, size === 1 ? 0 : i / (size - 1))
  return out
}

/** 轨道在某个时刻的取值：首尾外推取端点，中间按 smooth 决定线性/平滑 */
export function sampleTrack(track: Track, time: number): number | Vec3 | null {
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

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6) || 'ffffff', 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** 返回 0..1 的 sRGB 分量，用于 UI / canvas 预览 */
export function gradientColorAt(gradient: Gradient, t: number): [number, number, number] {
  const stops = [...(gradient?.stops?.length ? gradient.stops : [{ t: 0, color: '#ffffff' }])].sort(
    (a, b) => a.t - b.t
  )
  t = clamp(t, 0, 1)
  if (t <= stops[0].t) return hexToRgb(stops[0].color)
  const last = stops[stops.length - 1]
  if (t >= last.t) return hexToRgb(last.color)
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (t >= a.t && t <= b.t) {
      const span = Math.max(1e-6, b.t - a.t)
      const u = (t - a.t) / span
      const ca = hexToRgb(a.color)
      const cb = hexToRgb(b.color)
      return [
        lerp(ca[0], cb[0], u) / 255,
        lerp(ca[1], cb[1], u) / 255,
        lerp(ca[2], cb[2], u) / 255
      ]
    }
  }
  return hexToRgb(last.color)
}

const tmpColor = new Color()
/** 线性空间的 RGBA LUT（three 渲染用），A 来自色标的可选 a 字段 */
export function buildGradientLUT(gradient: Gradient, size = 64): Float32Array {
  const out = new Float32Array(size * 4)
  for (let i = 0; i < size; i++) {
    const t = size === 1 ? 0 : i / (size - 1)
    const [r, g, b] = gradientColorAt(gradient, t)
    tmpColor.setRGB(r, g, b, 'srgb')
    out[i * 4] = tmpColor.r
    out[i * 4 + 1] = tmpColor.g
    out[i * 4 + 2] = tmpColor.b
    out[i * 4 + 3] = gradientAlphaAt(gradient, t)
  }
  return out
}

/** 生命内透明度（色标 a 字段线性插值，缺省 1） */
export function gradientAlphaAt(gradient: Gradient, t: number): number {
  const stops = [...(gradient?.stops?.length ? gradient.stops : [{ t: 0, color: '#ffffff' }])].sort(
    (a, b) => a.t - b.t
  )
  const av = (s: { a?: number }) => (typeof s.a === 'number' ? clamp(s.a, 0, 1) : 1)
  t = clamp(t, 0, 1)
  if (t <= stops[0].t) return av(stops[0])
  const last = stops[stops.length - 1]
  if (t >= last.t) return av(last)
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (t >= a.t && t <= b.t) {
      const span = Math.max(1e-6, b.t - a.t)
      return lerp(av(a), av(b), (t - a.t) / span)
    }
  }
  return av(last)
}

export function gradientToCSS(gradient: Gradient): string {
  const stops = [...gradient.stops].sort((a, b) => a.t - b.t)
  const body = stops
    .map((s) => {
      const h = s.color.replace('#', '')
      const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
      const r = parseInt(full.slice(0, 2), 16) || 0
      const g = parseInt(full.slice(2, 4), 16) || 0
      const b = parseInt(full.slice(4, 6), 16) || 0
      const a = typeof s.a === 'number' ? clamp(s.a, 0, 1) : 1
      return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)}) ${(s.t * 100).toFixed(1)}%`
    })
    .join(', ')
  return `linear-gradient(90deg, ${body})`
}

/** 将色标采样成 rgba（Godot 导出用），a = 色标透明度 × alphaFn(生命周期) */
export function gradientSamples(gradient: Gradient, count = 16, alphaFn?: (t: number) => number) {
  const out: Array<{ t: number; r: number; g: number; b: number; a: number }> = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    const [r, g, b] = gradientColorAt(gradient, t)
    const a = gradientAlphaAt(gradient, t) * (alphaFn ? alphaFn(t) : 1)
    out.push({ t, r, g, b, a: clamp(a, 0, 1) })
  }
  return out
}
