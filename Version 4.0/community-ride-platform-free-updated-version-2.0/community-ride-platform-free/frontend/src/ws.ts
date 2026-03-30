import { getToken } from './api'

type Handler = (msg: any) => void

function defaultWsBase() {
  if (typeof window === 'undefined') return 'ws://localhost:8000'
  if (import.meta.env.DEV) return 'ws://localhost:8000'
  return window.location.origin.replace(/^http/, 'ws')
}

export class WSClient {
  private ws: WebSocket | null = null
  private handlers: Set<Handler> = new Set()
  connect() {
    const token = getToken()
    if (!token) return
    const url = (import.meta.env.VITE_WS_BASE ?? defaultWsBase()) + `/ws?token=${encodeURIComponent(token)}`
    this.ws = new WebSocket(url)
    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        this.handlers.forEach(h => h(data))
      } catch {}
    }
    this.ws.onopen = () => {
      // ping keepalive
      const id = window.setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('ping')
      }, 25000)
      ;(this.ws as any)._pingId = id
    }
    this.ws.onclose = () => {
      const id = (this.ws as any)?._pingId
      if (id) window.clearInterval(id)
    }
  }
  on(handler: Handler) { this.handlers.add(handler); return () => this.handlers.delete(handler) }
  close() { this.ws?.close(); this.ws = null }
}

export const wsClient = new WSClient()
