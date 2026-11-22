import { Color } from 'three'
import type { Curve, Gradient } from './types'

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
/** 线性空间的 RGB LUT（three 渲染用） */
export function buildGradientLUT(gradient: Gradient, size = 64): Float32Array {
  const out = new Float32Array(size * 3)
  for (let i = 0; i < size; i++) {
    const t = size === 1 ? 0 : i / (size - 1)
    const [r, g, b] = gradientColorAt(gradient, t)
    tmpColor.setRGB(r, g, b, 'srgb')
    out[i * 3] = tmpColor.r
    out[i * 3 + 1] = tmpColor.g
    out[i * 3 + 2] = tmpColor.b
  }
  return out
}

export function gradientToCSS(gradient: Gradient): string {
  const stops = [...gradient.stops].sort((a, b) => a.t - b.t)
  const body = stops.map((s) => `${s.color} ${(s.t * 100).toFixed(1)}%`).join(', ')
  return `linear-gradient(90deg, ${body})`
}

/** 将色标采样成 rgba 字符串（Godot 导出用） */
export function gradientSamples(gradient: Gradient, count = 16, alphaFn?: (t: number) => number) {
  const out: Array<{ t: number; r: number; g: number; b: number; a: number }> = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    const [r, g, b] = gradientColorAt(gradient, t)
    out.push({ t, r: r / 255, g: g / 255, b: b / 255, a: alphaFn ? alphaFn(t) : 1 })
  }
  return out
}
