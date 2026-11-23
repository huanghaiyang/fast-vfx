// 无头 Chrome 里执行任意表达式的调试小工具
// 用法：node tools/qa-eval.mjs "<url>" "<expression>"
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const url = process.argv[2] || 'http://127.0.0.1:5273/?preset=subemit&t=1.6'
const expr = process.argv[3] || '1'
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9600 + Math.floor(Math.random() * 200)
const profile = path.join(process.env.TEMP || '.', 'fvx_eval_' + Date.now())
const child = spawn(
  CHROME,
  ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', '--enable-unsafe-swiftshader', `--remote-debugging-port=${PORT}`, '--window-size=1280,900', url],
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
const logs = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
  }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
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
  const r = await send('Runtime.evaluate', { expression: '!!window.__fastvfx_engine', returnByValue: true })
  if (r.result?.value) {
    ready = true
    break
  }
  await sleep(500)
}
if (!ready) throw new Error('未就绪')
await sleep(2500)
const out = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
console.log(JSON.stringify(out.result?.value ?? out, null, 2))
if (logs.length) console.log('[console]', logs.join('\n'))
ws.close()
child.kill()
await sleep(800)
try {
  fs.rmSync(profile, { recursive: true, force: true })
} catch {}
process.exit(0)
