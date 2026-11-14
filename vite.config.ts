import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'
import { handleRoom, memoryStore } from './api/room.ts'

/**
 * Serves /api/room from the dev and preview servers with an in-memory store,
 * so host ↔ board sync across devices works locally without Redis.
 * On Vercel the same handler runs as a function (api/room.ts).
 */
function roomApi(): Plugin {
  const store = memoryStore()
  const middleware: Connect.NextHandleFunction = (req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const url = `http://${req.headers.host ?? 'localhost'}${(req as Connect.IncomingMessage).originalUrl ?? req.url}`
      const request = new Request(url, {
        method: req.method,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
      })
      const response = await handleRoom(request, store)
      res.statusCode = response.status
      response.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(Buffer.from(await response.arrayBuffer()))
    })()
  }
  return {
    name: 'sto-glosow-room-api',
    configureServer(server) {
      server.middlewares.use('/api/room', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/room', middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), roomApi()],
})
