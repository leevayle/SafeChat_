/**
 * Chat lock helpers.
 * Server stores bcrypt(PIN) + locked_peer_ids.
 * Local cache mirrors enabled flag + peer map for offline UI; PIN plaintext is never kept.
 */
import { kvGet, kvSet, kvRemove } from './kv'

const PIN_FLAG = 'sc_chat_lock_enabled'
const LOCKS_KEY = 'sc_chat_locks'
/** Offline verify: SHA-256 hex of pin (not the server bcrypt hash). */
const LOCAL_HASH = 'sc_chat_lock_local_hash'

export function applyChatLockFromServer(data: {
  chat_lock_enabled?: boolean
  locked_peer_ids?: string[]
}) {
  const enabled = !!data.chat_lock_enabled
  try {
    if (enabled) kvSet(PIN_FLAG, '1')
    else {
      kvRemove(PIN_FLAG)
      kvRemove(LOCAL_HASH)
      // Legacy plaintext pin (pre-server lock) - wipe if present
      kvRemove('sc_chat_lock_pin')
    }
    const peers = Array.isArray(data.locked_peer_ids) ? data.locked_peer_ids : []
    const map: Record<string, boolean> = {}
    for (const id of peers) {
      const k = String(id || '').trim()
      if (k) map[k] = true
    }
    kvSet(LOCKS_KEY, JSON.stringify(map))
  } catch {
    /* */
  }
}

export function hasChatLockPin(): boolean {
  try {
    if (kvGet(PIN_FLAG) === '1') return true
    // Legacy local-only pin
    if (kvGet('sc_chat_lock_pin')) return true
    if (kvGet(LOCAL_HASH)) return true
  } catch {
    /* */
  }
  return false
}

export function getLockedPeerMap(): Record<string, boolean> {
  try {
    return JSON.parse(kvGet(LOCKS_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

export function isPeerLocked(peerId: string): boolean {
  const id = String(peerId || '').trim()
  if (!id) return false
  const map = getLockedPeerMap()
  return !!map[id]
}

export async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(text)
    const buf = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  // Fallback: not cryptographic but better than plain (very old browsers)
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0
  return `x${(h >>> 0).toString(16)}`
}

export async function saveLocalPinHash(pin: string) {
  const h = await sha256Hex(`sc-lock:${pin}`)
  kvSet(LOCAL_HASH, h)
  kvSet(PIN_FLAG, '1')
  // Do not store plaintext PIN
  try {
    kvRemove('sc_chat_lock_pin')
  } catch {
    /* */
  }
}

export async function verifyLocalPin(pin: string): Promise<boolean> {
  try {
    const stored = kvGet(LOCAL_HASH) || ''
    if (stored) {
      const h = await sha256Hex(`sc-lock:${pin}`)
      return h === stored
    }
    // Legacy plaintext
    const legacy = kvGet('sc_chat_lock_pin') || ''
    if (legacy) return pin === legacy
  } catch {
    /* */
  }
  return false
}

export function setLocalLocks(map: Record<string, boolean>) {
  kvSet(LOCKS_KEY, JSON.stringify(map))
}

export function clearLocalChatLock() {
  try {
    kvRemove(PIN_FLAG)
    kvRemove(LOCAL_HASH)
    kvRemove(LOCKS_KEY)
    kvRemove('sc_chat_lock_pin')
  } catch {
    /* */
  }
}

export async function syncLockedPeersToServer(
  setLockedPeers: (ids: string[]) => Promise<unknown>,
) {
  const map = getLockedPeerMap()
  const ids = Object.keys(map).filter((k) => map[k])
  await setLockedPeers(ids)
}
