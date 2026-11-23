// 无头 Chrome 截图（支持先执行一段 JS，再截整页长图）
// 用法：node tools/qa-shot.mjs <url> <out.png> [width,height] [js]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const url = process.argv[2]
const outFile = path.resolve(process.argv[3])
const [w, h] = (process.argv[4] || '1500,2400').split(',').map(Number)
const js = process.argv[5] || ''
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9800 + Math.floor(Math.random() * 150)
const profile = path.join(process.env.TEMP || '.', 'fvx_shot_' + Date.now())
const child = spawn(
  CHROME,
  [
    '--headless=new',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--disable-extensions',
    '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${PORT}`,
    `--window-size=${w},${h}`,
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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
  }
}
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const mid = ++id
    pending.set(mid, { res, rej })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })

await send('Runtime.enable')
for (let i = 0; i < 40; i++) {
  const r = await send('Runtime.evaluate', { expression: '!!window.__fastvfx_engine', returnByValue: true })
  if (r.result?.value) break
  await sleep(500)
}
await sleep(2000)
if (js) {
  const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) console.log('JS 异常:', JSON.stringify(r.exceptionDetails).slice(0, 300))
  await sleep(900)
}
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'))
console.log('saved', outFile, fs.statSync(outFile).size)
ws.close()
child.kill()
await sleep(600)
try {
  fs.rmSync(profile, { recursive: true, force: true })
} catch {}
process.exit(0)
