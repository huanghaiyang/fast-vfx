import JSZip from 'jszip'
import { downloadBlob, getEngine, S, toast } from './store'

function safeName(): string {
  return (S.doc.name || 'effect').replace(/[^\w\u4e00-\u9fa5.-]+/g, '_')
}

async function blobOf(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画布导出失败'))), 'image/png')
  })
}

/** PNG 序列：逐帧渲染当前镜头视角，命名 frame_0001.png，打包成 zip 下载 */
export async function exportPngSequence(opts: { fps?: number; width?: number } = {}) {
  const engine = getEngine()
  if (!engine) {
    toast('渲染引擎未就绪', 'warn')
    return
  }
  const fps = Math.max(1, Math.round(opts.fps || 30))
  const duration = Math.max(0.1, S.doc.duration)
  const total = Math.max(1, Math.round(duration * fps))
  const wasPlaying = S.playing
  S.playing = false
  S.busy = true
  const zip = new JSZip()
  const canvas = engine.viewCanvas
  try {
    for (let i = 0; i < total; i++) {
      const t = Math.min(duration, i / fps)
      engine.renderFrame(t)
      const blob = await blobOf(canvas)
      zip.file(`frame_${String(i + 1).padStart(4, '0')}.png`, blob)
      if (i % 6 === 0) {
        toast(`渲染中 ${i + 1}/${total}`, 'info')
        await new Promise((r) => requestAnimationFrame(() => r(null)))
      }
    }
    zip.file(
      'frames.json',
      JSON.stringify({ name: S.doc.name, fps, frames: total, duration, width: canvas.width, height: canvas.height }, null, 2)
    )
    const out = await zip.generateAsync({ type: 'blob' })
    downloadBlob(out, `${safeName()}_png_${fps}fps_${total}frames.zip`)
    toast(`已导出 ${total} 帧 PNG 序列`, 'ok')
  } catch (err) {
    toast('PNG 序列导出失败：' + (err as Error).message, 'warn')
  } finally {
    S.busy = false
    engine.seek(S.time)
    if (wasPlaying) S.playing = true
  }
}

/** WebM 成片：实时录制舞台画布，录制期间关闭循环避免 t 跳回 0 重影 */
export async function exportWebm(opts: { fps?: number; bitrate?: number } = {}) {
  const engine = getEngine()
  if (!engine) {
    toast('渲染引擎未就绪', 'warn')
    return
  }
  const canvas = engine.viewCanvas
  const fps = Math.max(8, Math.round(opts.fps || 30))
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
  )
  if (!mime) {
    toast('浏览器不支持 WebM 录制，请用 Chrome / Edge', 'warn')
    return
  }
  const duration = Math.max(0.1, S.doc.duration)
  const loopBefore = S.doc.loop
  const wasPlaying = S.playing
  const stream = canvas.captureStream(fps)
  const chunks: Blob[] = []
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: opts.bitrate || 12_000_000 })
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  const done = new Promise<void>((resolve) => {
    rec.onstop = () => resolve()
  })

  S.busy = true
  S.doc.loop = false
  S.time = 0
  engine.resetEmittersPublic()
  S.playing = true
  rec.start(100)

  // 时长 + 0.3s 余量，保证末帧粒子落到画面里
  await new Promise<void>((resolve) => {
    const t0 = performance.now()
    const tick = () => {
      if (performance.now() - t0 >= (duration + 0.3) * 1000) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  S.playing = false
  rec.stop()
  await done
  S.busy = false
  S.doc.loop = loopBefore
  if (!wasPlaying) S.time = 0
  stream.getTracks().forEach((tr) => tr.stop())

  if (!chunks.length) {
    toast('录制没有产生数据', 'warn')
    return
  }
  downloadBlob(new Blob(chunks, { type: mime }), `${safeName()}_${widthTag(canvas)}_${fps}fps.webm`)
  toast('已导出 WebM 成片', 'ok')
}

function widthTag(canvas: HTMLCanvasElement) {
  return `${canvas.width}x${canvas.height}`
}
