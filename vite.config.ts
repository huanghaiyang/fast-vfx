import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 上传的 GLB 落到项目 data/models 目录：
 * POST /api/models/save    { name, base64 } -> { url, file, sizeKB }
 * GET  /api/models/list    -> [{ file, url, sizeKB }]
 * POST /api/models/delete  { file }
 * 浏览器端只拿到 /data/models/<file> 这个相对地址，二进制永远在项目目录里。
 */
function modelFolderPlugin(): Plugin {
  const dir = path.resolve(process.cwd(), 'data/models')
  const slug = (name: string) =>
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'model'

  return {
    name: 'fastvfx-model-folder',
    configureServer(server) {
      server.middlewares.use('/api/models', (req, res) => {
        const route = (req.url || '/').split('?')[0]
        const fail = (code: number, msg: string) => {
          res.statusCode = code
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: msg }))
        }

        if (route === '/list') {
          try {
            fs.mkdirSync(dir, { recursive: true })
            const files = fs
              .readdirSync(dir)
              .filter((f) => /\.(glb|gltf)$/i.test(f))
              .map((file) => {
                const st = fs.statSync(path.join(dir, file))
                return { file, url: `/data/models/${file}`, sizeKB: Math.round(st.size / 1024), mtime: st.mtimeMs }
              })
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ dir: 'data/models', files }))
          } catch (err) {
            fail(500, (err as Error).message)
          }
          return
        }

        if (route === '/save' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', () => {
            try {
              const payload = JSON.parse(body) as { name?: string; base64?: string }
              if (!payload.base64) return fail(400, '缺少 base64')
              fs.mkdirSync(dir, { recursive: true })
              const base = slug(payload.name || 'model')
              let file = `${base}.glb`
              let n = 1
              while (fs.existsSync(path.join(dir, file))) file = `${base}-${++n}.glb`
              const bin = Buffer.from(payload.base64, 'base64')
              fs.writeFileSync(path.join(dir, file), bin)
              res.setHeader('content-type', 'application/json; charset=utf-8')
              res.end(
                JSON.stringify({
                  file,
                  url: `/data/models/${file}`,
                  sizeKB: Math.round(bin.length / 1024)
                })
              )
            } catch (err) {
              fail(500, (err as Error).message)
            }
          })
          return
        }

        if (route === '/delete' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', () => {
            try {
              const { file } = JSON.parse(body) as { file?: string }
              if (!file) return fail(400, '缺少 file')
              const p = path.join(dir, path.basename(file))
              if (fs.existsSync(p)) fs.unlinkSync(p)
              res.setHeader('content-type', 'application/json; charset=utf-8')
              res.end(JSON.stringify({ ok: true }))
            } catch (err) {
              fail(500, (err as Error).message)
            }
          })
          return
        }

        fail(404, 'unknown route')
      })
    }
  }
}

export default defineConfig({
  plugins: [vue(), modelFolderPlugin()],
  server: { port: 5273, host: '127.0.0.1' },
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 }
})
