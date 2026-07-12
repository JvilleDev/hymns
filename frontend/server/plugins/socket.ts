import type { NitroApp } from 'nitropack'
import { proxyRequest } from 'h3'

export default defineNitroPlugin((nitroApp: NitroApp) => {
  // Handle WebSocket upgrade
  // Note: This works when running with a Node.js server (like bun or node)
  // Nitro experimental websocket might handle this differently, but for proxying 
  // we often need to hook into the raw server.
  
  const server = (nitroApp as any).server
  if (server && server.on) {
    server.on('upgrade', (req: any, socket: any, head: any) => {
      if (req.url?.startsWith('/socket.io/')) {
        console.log('[Nitro] Proxying WebSocket upgrade for:', req.url)
        // We can't easily use proxyRequest for the upgrade itself here without a proxy library
        // But for development, we can try to redirect or use a more robust solution if available.
      }
    })
  }
})
