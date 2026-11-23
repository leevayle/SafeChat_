/**
 * SafeChat persistent cache (IndexedDB)
 * Stale-while-revalidate: paint cached UI instantly, merge network updates in place.
 *
 * Stores: chats, contacts, messages, statuses, notifications, saveRequests,
 *         statusViewers, outbox (unsent), meta, groups
 */

const DB_NAME = 'safechat_cache_v1'
const DB_VERSION = 2

type StoreName =
  | 'chats'
  | 'contacts'
  | 'messages'
  | 'statuses'
  | 'notifications'
  | 'saveRequests'
  | 'statusViewers'
  | 'outbox'
  | 'meta'
  | 'groups'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no idb'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      const stores: StoreName[] = [
        'chats',
        'contacts',
        'messages',
        'statuses',
        'notifications',
        'saveRequests',
        'statusViewers',
        'outbox',
        'meta',
        'groups',
      ]
      for (const name of stores) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' })
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('idb open failed'))
  })
  return dbPromise
}

async function idbGet<T>(store: StoreName, id: string): Promise<T | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly')
      const r = tx.objectStore(store).get(id)
      r.onsuccess = () => resolve((r.result as T) ?? null)
      r.onerror = () => reject(r.error)
    })
  } catch {
    return null
  }
}

async function idbPut(store: StoreName, value: { id: string } & Record<string, unknown>) {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(value)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* private mode / quota */
  }
}

async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly')
      const r = tx.objectStore(store).getAll()
      r.onsuccess = () => resolve((r.result as T[]) || [])
      r.onerror = () => reject(r.error)
    })
  } catch {
    return []
  }
}

async function idbDelete(store: StoreName, id: string) {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* */
  }
}

async function idbClear(store: StoreName) {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* */
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Cache owner — stored in IDB meta (same DB as chats/contacts/messages). */
let _ownerMem: string | null | undefined

const OWNER_META_ID = 'cache_owner'

export function cacheOwnerId(): string | null {
  if (_ownerMem !== undefined) return _ownerMem
  return null
}

export function setCacheOwner(userId: string) {
  _ownerMem = userId || null
  void idbPut('meta', { id: OWNER_META_ID, userId })
}

/** Call on boot so sync cacheOwnerId() works after reload. */
export async function hydrateCacheOwner(): Promise<string | null> {
  try {
    const row = await idbGet<{ id: string; userId?: string }>('meta', OWNER_META_ID)
    _ownerMem = (row?.userId as string) || null
    return _ownerMem
  } catch {
    _ownerMem = null
    return null
  }
}

/** Wipe all caches (logout / account switch) */
export async function clearAllCaches() {
  const stores: StoreName[] = [
    'chats',
    'contacts',
    'messages',
    'statuses',
    'notifications',
    'saveRequests',
    'statusViewers',
    'outbox',
    'meta',
    'groups',
  ]
  await Promise.all(stores.map((s) => idbClear(s)))
}

// Chats (home list)
export async function loadCachedChats<T>(): Promise<T[]> {
  const row = await idbGet<{ id: string; items: T[] }>('chats', 'list')
  return row?.items || []
}

export async function saveCachedChats<T>(items: T[]) {
  await idbPut('chats', { id: 'list', items, updatedAt: Date.now() })
}

// Groups (same stale-while-revalidate pattern as chats)
export async function loadCachedGroups<T>(): Promise<T[]> {
  const row = await idbGet<{ id: string; items: T[] }>('groups', 'list')
  return row?.items || []
}

export async function saveCachedGroups<T>(items: T[]) {
  await idbPut('groups', { id: 'list', items, updatedAt: Date.now() })
}

// Contacts
export async function loadCachedContacts<T>(): Promise<T[]> {
  const row = await idbGet<{ id: string; items: T[] }>('contacts', 'list')
  return row?.items || []
}

export async function saveCachedContacts<T>(items: T[]) {
  await idbPut('contacts', { id: 'list', items, updatedAt: Date.now() })
}

// Messages per conversation (last N)
export async function loadCachedThread<T>(conversationId: string): Promise<T[] | null> {
  if (!conversationId) return null
  const row = await idbGet<{ id: string; items: T[] }>('messages', conversationId)
  return row?.items ?? null
}

export async function saveCachedThread<T>(conversationId: string, items: T[]) {
  if (!conversationId) return
  // Keep last 80 for reopen speed
  await idbPut('messages', {
    id: conversationId,
    items: items.slice(-80),
    updatedAt: Date.now(),
  })
}

/** Remove one conversation thread from IndexedDB (after server delete succeeds). */
export async function removeCachedThread(conversationId: string) {
  if (!conversationId) return
  await idbDelete('messages', conversationId)
}

// Statuses
export async function loadCachedStatuses<T>(): Promise<T[]> {
  const row = await idbGet<{ id: string; items: T[] }>('statuses', 'list')
  return row?.items || []
}

export async function saveCachedStatuses<T>(items: T[]) {
  await idbPut('statuses', { id: 'list', items, updatedAt: Date.now() })
}

// Notifications
export async function loadCachedNotifications<T>(): Promise<T[]> {
  const row = await idbGet<{ id: string; items: T[] }>('notifications', 'list')
  return row?.items || []
}

export async function saveCachedNotifications<T>(items: T[]) {
  await idbPut('notifications', { id: 'list', items, updatedAt: Date.now() })
}

// Save requests (incoming + outgoing) - durable across reloads; server is source of truth cross-device
export async function loadCachedSaveRequests<T>(): Promise<T[]> {
  const row = await idbGet<{ id: string; items: T[] }>('saveRequests', 'list')
  return row?.items || []
}

export async function saveCachedSaveRequests<T>(items: T[]) {
  await idbPut('saveRequests', { id: 'list', items, updatedAt: Date.now() })
}

export type SaveRequestsBundle<T = unknown> = {
  incoming: T[]
  outgoing: T[]
  updatedAt?: number
}

export async function loadCachedSaveRequestsBundle<T = unknown>(): Promise<SaveRequestsBundle<T>> {
  const row = await idbGet<{ id: string; incoming?: T[]; outgoing?: T[]; updatedAt?: number }>(
    'saveRequests',
    'bundle',
  )
  return {
    incoming: Array.isArray(row?.incoming) ? row!.incoming! : [],
    outgoing: Array.isArray(row?.outgoing) ? row!.outgoing! : [],
    updatedAt: row?.updatedAt,
  }
}

export async function saveCachedSaveRequestsBundle<T = unknown>(bundle: {
  incoming: T[]
  outgoing: T[]
}) {
  await idbPut('saveRequests', {
    id: 'bundle',
    incoming: bundle.incoming || [],
    outgoing: bundle.outgoing || [],
    updatedAt: Date.now(),
  })
}

// Status viewers
export async function loadCachedViewers<T>(statusId: string): Promise<T[] | null> {
  const row = await idbGet<{ id: string; items: T[] }>('statusViewers', statusId)
  return row?.items ?? null
}

export async function saveCachedViewers<T>(statusId: string, items: T[]) {
  await idbPut('statusViewers', { id: statusId, items, updatedAt: Date.now() })
}

// Outbox — ordered unsent / pending messages with backoff
export type OutboxItem = {
  id: string
  conversationId: string
  contactId: string
  text: string
  image?: string | null
  createdAt: string
  payload?: Record<string, unknown>
  /** send attempts so far */
  attempts?: number
  /** earliest time this item may be retried (ms epoch) */
  nextAttemptAt?: number
  status?: 'queued' | 'sending' | 'failed'
  replyToId?: string
}

export async function loadOutbox(): Promise<OutboxItem[]> {
  const items = await idbGetAll<OutboxItem>('outbox')
  return items.sort((a, b) => {
    const ta = Date.parse(a.createdAt) || 0
    const tb = Date.parse(b.createdAt) || 0
    if (ta !== tb) return ta - tb
    return String(a.id).localeCompare(String(b.id))
  })
}

export async function putOutbox(item: OutboxItem) {
  await idbPut('outbox', {
    ...item,
    attempts: item.attempts ?? 0,
    status: item.status || 'queued',
    nextAttemptAt: item.nextAttemptAt ?? 0,
  })
}

export async function removeOutbox(id: string) {
  await idbDelete('outbox', id)
}

/** Exponential backoff: 2s, 4s, 8s … capped at 5 min */
export function outboxBackoffMs(attempts: number): number {
  const base = 2000
  const ms = Math.min(5 * 60 * 1000, base * Math.pow(2, Math.max(0, attempts - 1)))
  const jitter = Math.floor(Math.random() * 400)
  return ms + jitter
}

export async function markOutboxAttempt(id: string, failed: boolean) {
  const items = await loadOutbox()
  const item = items.find((x) => x.id === id)
  if (!item) return
  const attempts = (item.attempts || 0) + 1
  await putOutbox({
    ...item,
    attempts,
    status: failed ? 'failed' : 'sending',
    nextAttemptAt: failed ? Date.now() + outboxBackoffMs(attempts) : 0,
  })
}

export async function loadDueOutbox(now = Date.now()): Promise<OutboxItem[]> {
  const items = await loadOutbox()
  return items.filter((item) => (item.nextAttemptAt || 0) <= now)
}

// Meta timestamps for incremental sync hints
export async function getMeta(key: string): Promise<number | null> {
  const row = await idbGet<{ id: string; ts: number }>('meta', key)
  return row?.ts ?? null
}

export async function setMeta(key: string, ts: number = Date.now()) {
  await idbPut('meta', { id: key, ts })
}
