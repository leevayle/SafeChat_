/**
 * Persistent WebSocket client — one TCP connection for:
 *   messages, receipts, call signaling (SDP offer/answer/ICE)
 *
 * Packets (server → client):
 *   { t: "msg",  c, m }
 *   { t: "rcpt", c, id, s }
 *   { t: "ack",  ck, ok, id?, s?, err? }
 *   { t: "call", a, from, to, callId, sdp?, candidate?, kind? }
 *   { t: "pong" }
 *
 * Packets (client → server):
 *   { t: "send", c, text, ck, img? }
 *   { t: "rcpt", c, id, s }
 *   { t: "call", a, to, callId, sdp?, candidate?, kind? }
 *   { t: "ping" }
 */
import { hasAccessToken } from './api'

export type RtMsg = {
  id: string
  from: string
  text: string
  time?: string
  type?: string
  image?: string | null
  state?: string
  reply_to_message_id?: string | null
  reply_to_text?: string | null
}

export type RtCallPacket = {
  a: string
  from?: string
  to?: string
  callId?: string
  sdp?: string
  candidate?: RTCIceCandidateInit | null
  kind?: 'audio' | 'video'
  reason?: string
  ts?: string
}

export type RtHandlers = {
  onMessage?: (conversationId: string, message: RtMsg) => void
  onReceipt?: (conversationId: string, messageId: string, state: string) => void
  onAck?: (payload: {
    ck?: string
    ok: boolean
    id?: string
    c?: string
    s?: string
    err?: string
    ts?: string
  }) => void
  onCall?: (packet: RtCallPacket) => void
  onTyping?: (peerId: string, typing: boolean) => void
  onPresence?: (peerId: string, online: boolean, lastSeen?: string | null) => void
  onEdit?: (cid: string, messageId: string, text: string) => void
  onReact?: (cid: string, messageId: string, emoji: string, userId: string, removed: boolean) => void
  onStatus?: (status: 'open' | 'closed' | 'error') => void
}

type SocketState = {
  ws: WebSocket | null
  handlers: RtHandlers
  pingTimer: ReturnType<typeof setInterval> | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  intentionalClose: boolean
  retries: number
}

const state: SocketState = {
  ws: null,
  handlers: {},
  pingTimer: null,
  reconnectTimer: null,
  intentionalClose: false,
  retries: 0,
}

function wsUrl(token: string): string {
  const env = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
  if (!env) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/api/v1/ws?token=${encodeURIComponent(token)}`
  }
  try {
    const u = new URL(env)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = '/api/v1/ws'
    u.search = `token=${encodeURIComponent(token)}`
    return u.toString()
  } catch {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/api/v1/ws?token=${encodeURIComponent(token)}`
  }
}

function clearTimers() {
  if (state.pingTimer) {
    clearInterval(state.pingTimer)
    state.pingTimer = null
  }
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer)
    state.reconnectTimer = null
  }
}

function scheduleReconnect() {
  if (state.intentionalClose) return
  if (!hasAccessToken()) return
  const delay = Math.min(15000, 800 * Math.pow(1.6, state.retries))
  state.retries += 1
  state.reconnectTimer = setTimeout(() => {
    connectRealtime(state.handlers)
  }, delay)
}

function rawSend(obj: object): boolean {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return false
  try {
    state.ws.send(JSON.stringify(obj))
    return true
  } catch {
    return false
  }
}

export function setRealtimeHandlers(handlers: RtHandlers) {
  state.handlers = { ...state.handlers, ...handlers }
}

export function connectRealtime(handlers?: RtHandlers) {
  if (handlers) state.handlers = { ...state.handlers, ...handlers }
  if (!hasAccessToken()) return
  if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
    return
  }

  state.intentionalClose = false
  const token = localStorage.getItem('sc_access') || localStorage.getItem('sc_token') || ''
  if (!token) return

  let ws: WebSocket
  try {
    ws = new WebSocket(wsUrl(token))
  } catch {
    scheduleReconnect()
    return
  }
  state.ws = ws

  ws.onopen = () => {
    state.retries = 0
    state.handlers.onStatus?.('open')
    state.pingTimer = setInterval(() => {
      rawSend({ t: 'ping' })
    }, 25000)
  }

  ws.onmessage = (ev) => {
    let data: any
    try {
      data = JSON.parse(String(ev.data))
    } catch {
      return
    }
    const t = data?.t
    if (t === 'pong' || t === 'ping') return
    if (t === 'msg' && data.c && data.m) {
      state.handlers.onMessage?.(String(data.c), data.m as RtMsg)
      return
    }
    if (t === 'edit' && data.c && data.id) {
      state.handlers.onEdit?.(String(data.c), String(data.id), String(data.text || ''))
      try {
        window.dispatchEvent(
          new CustomEvent('sc:rt-edit', {
            detail: { cid: String(data.c), id: String(data.id), text: String(data.text || '') },
          }),
        )
      } catch { /* */ }
      return
    }
    if (t === 'react' && data.c && data.id) {
      state.handlers.onReact?.(
        String(data.c),
        String(data.id),
        String(data.emoji || ''),
        String(data.from || ''),
        !!data.removed,
      )
      try {
        window.dispatchEvent(
          new CustomEvent('sc:rt-react', {
            detail: {
              cid: String(data.c),
              id: String(data.id),
              emoji: String(data.emoji || ''),
              userId: String(data.from || ''),
              removed: !!data.removed,
            },
          }),
        )
      } catch { /* */ }
      return
    }
    if (t === 'rcpt' && data.c && data.id && data.s) {
      state.handlers.onReceipt?.(String(data.c), String(data.id), String(data.s))
      return
    }
    if (t === 'ack') {
      state.handlers.onAck?.({
        ck: data.ck,
        ok: !!data.ok,
        id: data.id,
        c: data.c,
        s: data.s,
        err: data.err,
        ts: data.ts,
      })
      return
    }
    if (t === 'call') {
      state.handlers.onCall?.(data as RtCallPacket)
      return
    }
    if (t === 'typing' && data.from) {
      state.handlers.onTyping?.(String(data.from), !!data.typing)
      if (data.live || data.draft != null) {
        window.dispatchEvent(
          new CustomEvent('sc:rt-live-typing', {
            detail: { peerId: String(data.from), draft: data.draft ?? '' },
          }),
        )
      }
      return
    }
    if (t === 'presence' && data.userId) {
      state.handlers.onPresence?.(
        String(data.userId),
        !!data.online,
        data.lastSeen || null,
      )
    }
  }

  ws.onerror = () => {
    state.handlers.onStatus?.('error')
  }

  ws.onclose = () => {
    clearTimers()
    state.ws = null
    state.handlers.onStatus?.('closed')
    scheduleReconnect()
  }
}

export function disconnectRealtime() {
  state.intentionalClose = true
  clearTimers()
  try {
    state.ws?.close()
  } catch {
    /* */
  }
  state.ws = null
}

export function isRealtimeOpen() {
  return !!state.ws && state.ws.readyState === WebSocket.OPEN
}

/** Send chat message over the persistent socket. Returns false if offline → caller should REST-fallback. */
export function wsSendMessage(opts: {
  conversationId: string
  text: string
  clientKey: string
  image?: string | null
  replyToId?: string | null
}): boolean {
  return rawSend({
    t: 'send',
    c: opts.conversationId,
    text: opts.text || '',
    ck: opts.clientKey,
    img: opts.image || undefined,
    reply_to: opts.replyToId || undefined,
  })
}

export function wsReceipt(opts: { conversationId?: string; messageId: string; state: 'delivered' | 'read' }) {
  return rawSend({
    t: 'rcpt',
    c: opts.conversationId,
    id: opts.messageId,
    s: opts.state,
  })
}

export function wsCall(packet: {
  a: string
  to: string
  callId: string
  sdp?: string
  candidate?: RTCIceCandidateInit | null
  kind?: 'audio' | 'video'
  reason?: string
}) {
  return rawSend({ t: 'call', ...packet })
}


export function wsTyping(peerId: string, typing: boolean) {
  return rawSend({ t: 'typing', to: peerId, typing: !!typing })
}

/**
 * Live typing for all users — stream current draft (including empty on delete/clear).
 * Peer renders this in the chat header + in-chat live preview (not classic dots).
 */
export function wsLiveTyping(to: string, draft: string) {
  if (!to) return false
  const text = draft == null ? '' : String(draft).slice(0, 2000)
  return rawSend({
    t: 'typing',
    to,
    draft: text,
    live: true,
    typing: text.length > 0,
  })
}
