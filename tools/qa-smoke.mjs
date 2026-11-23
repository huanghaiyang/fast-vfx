// 冒烟测试：逐个载入全部预设，检查关键字段、粒子存活、无运行时报错
// 用法：node tools/qa-smoke.mjs
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const url = process.argv[2] || 'http://127.0.0.1:5273/'
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9700 + Math.floor(Math.random() * 150)
const profile = path.join(process.env.TEMP || '.', 'fvx_smoke_' + Date.now())
const child = spawn(
  CHROME,
  [
    '--headless=new',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--disable-extensions',
    '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1280,900',
    url
  ],
  { stdio: 'ignore' }
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let page
for (let i = 0; i < 40 && !page; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    page = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl)
  } catch {}
  if (!page) await sleep(500)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})
let id = 0
const pending = new Map()
const errors = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
  }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || 'exception')
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
}
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const mid = ++id
    pending.set(mid, { res, rej })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
await send('Runtime.enable')

let ready = false
for (let i = 0; i < 40; i++) {
  const r = await send('Runtime.evaluate', { expression: '!!window.__fastvfx_store', returnByValue: true })
  if (r.result?.value) {
    ready = true
    break
  }
  await sleep(500)
}
if (!ready) throw new Error('编辑器未就绪')

const expr = `(async () => {
  const { S, A, PRESETS } = window.__fastvfx_store
  const eng = window.__fastvfx_engine
  const out = []
  for (const p of PRESETS) {
    A.setPreset(p.id)
    S.playing = false
    S.time = Math.min(0.2, S.doc.duration)
    eng.seek(S.time)
    const parts = [...eng.runtimes.values()].filter((r) => r.particle)
    const alive = parts.map((r) => ({ name: r.particle.doc.name, n: r.particle.alive }))
    const badFields = S.doc.objects
      .filter((o) => o.kind === 'particles')
      .flatMap((o) => [
        o.speedCurve ? null : 'speedCurve',
        o.spinCurve ? null : 'spinCurve',
        o.collide ? null : 'collide',
        o.sub ? null : 'sub',
        o.render.flipbook ? null : 'flipbook'
      ])
      .filter(Boolean)
    const flip = S.doc.objects.filter((o) => o.kind === 'particles' && o.render.flipbook && o.render.flipbook.enabled)
    // 实体粒子检查：实例化网格真的建起来了、有实例色、有几何
    const meshParts = [...eng.runtimes.values()].filter((r) => r.particle && r.particle.doc.render.mode === 'mesh')
    const meshBad = meshParts.filter((r) => {
      const p = r.particle
      return !p.inst || !p.inst.geometry || !p.inst.instanceColor || p.inst.count <= 0 || !p.inst.visible
    }).map((r) => r.particle.doc.name)
    out.push({
      id: p.id,
      name: p.name,
      objects: S.doc.objects.length,
      alive: alive.filter((a) => a.n > 0).length,
      totalAlive: alive.reduce((s, a) => s + a.n, 0),
      flipbook: flip.length,
      collide: S.doc.objects.filter((o) => o.kind === 'particles' && o.collide && o.collide.enabled).length,
      mesh: meshParts.length,
      meshBad,
      badFields
    })
  }
  return out
})()`

const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400))
const rows = r.result.value
let failed = 0
for (const row of rows) {
  const issues = []
  if (row.objects <= 0) issues.push('无对象')
  if (row.totalAlive <= 0) issues.push('0.2s 时无存活粒子')
  if (row.badFields.length) issues.push('缺字段 ' + row.badFields.join('/'))
  if (row.meshBad && row.meshBad.length) issues.push('实体粒子未建设例 ' + row.meshBad.join('/'))
  const status = issues.length ? 'FAIL' : 'ok'
  if (issues.length) failed++
  console.log(
    `${status.padEnd(4)} ${row.id.padEnd(12)} ${String(row.totalAlive).padStart(5)} 粒子存活 | flip ${row.flipbook} | collide ${row.collide} | mesh ${row.mesh}${issues.length ? ' | ' + issues.join('; ') : ''}`
  )
}
if (errors.length) {
  console.log('运行时错误:', errors.slice(0, 5))
  failed++
}
console.log(`\n预设 ${rows.length} 套，失败 ${failed} 项`)
ws.close()
child.kill()
await sleep(800)
try {
  fs.rmSync(profile, { recursive: true, force: true })
} catch {}
process.exit(failed ? 1 : 0)
