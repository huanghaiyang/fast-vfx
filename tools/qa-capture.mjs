// 无头 Chrome + CDP 验收：跑 PNG 序列 / WebM 成片，确认真的产出文件
// 用法：node tools/qa-capture.mjs <png|webm> <downloadDir> [url]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const mode = process.argv[2] || 'png'
const dlDir = path.resolve(process.argv[3] || './tmp-capture')
const url = process.argv[4] || 'http://127.0.0.1:5273/?preset=subemit'
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9400 + Math.floor(Math.random() * 200)
const profile = path.join(process.env.TEMP || '.', 'fvx_qa_' + Date.now())

fs.mkdirSync(dlDir, { recursive: true })
for (const f of fs.readdirSync(dlDir)) fs.rmSync(path.join(dlDir, f), { force: true })

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

async function getPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      /* 等浏览器起来 */
    }
    await sleep(500)
  }
  throw new Error('无法连接 Chrome')
}

const page = await getPage()
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})
let id = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result)
  }
  if (msg.method === 'Log.entryAdded') console.log('[page]', msg.params.entry.level, msg.params.entry.text)
}
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const mid = ++id
    pending.set(mid, { res, rej })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })

await send('Runtime.enable')
await send('Log.enable')
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir })

// 等编辑器把预设装好（引擎注册上 __fastvfx_engine）
let ready = false
for (let i = 0; i < 40; i++) {
  const r = await send('Runtime.evaluate', {
    expression: '!!(window.__fastvfx_engine && window.__fastvfx_capture)',
    returnByValue: true
  })
  if (r.result?.value) {
    ready = true
    break
  }
  await sleep(500)
}
if (!ready) throw new Error('编辑器未就绪')

const expr =
  mode === 'png'
    ? 'window.__fastvfx_capture.exportPngSequence({fps:12}).then(()=>"png-done")'
    : 'window.__fastvfx_capture.exportWebm({fps:24}).then(()=>"webm-done")'

const out = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
if (out.exceptionDetails) throw new Error(JSON.stringify(out.exceptionDetails))
console.log('result:', out.result?.value)
await sleep(4000)

const files = fs.readdirSync(dlDir).map((f) => ({ f, size: fs.statSync(path.join(dlDir, f)).size }))
console.log('downloads:', JSON.stringify(files, null, 2))

// 若是 zip，解出来看帧数
const zipName = files.find((x) => x.f.endsWith('.zip'))
if (zipName && files.length) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(dlDir, zipName.f)))
  const frames = Object.keys(zip.files).filter((f) => f.startsWith('frames/frame_') || f.startsWith('frame_'))
  console.log('frames in zip:', frames.length, frames.slice(0, 3))
}

ws.close()
child.kill()
await sleep(800)
try {
  fs.rmSync(profile, { recursive: true, force: true })
} catch {
  /* Chrome 退出时句柄还没释放，临时目录残留不影响结论 */
}
process.exit(0)
