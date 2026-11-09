/**
 * SafeChat persistent cache (IndexedDB)
 * Stale-while-revalidate: paint cached UI instantly, merge network updates in place.
 *
 * Stores: chats, contacts, messages, statuses, notifications, saveRequests,
 *         statusViewers, outbox (unsent), meta
 */

const DB_NAME = 'safechat_cache_v1'
const DB_VERSION = 1

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

const USER_KEY = 'sc_cache_owner'

export function cacheOwnerId(): string | null {
  try {
    return localStorage.getItem(USER_KEY)
  } catch {
    return null
  }
}

export function setCacheOwner(userId: string) {
  try {
    localStorage.setItem(USER_KEY, userId)
  } catch {
    /* */
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

// Save requests
export async function loadCachedSaveRequests<T>(): Promise<T[]> {
  const row = await idbGet<{ id: string; items: T[] }>('saveRequests', 'list')
  return row?.items || []
}

export async function saveCachedSaveRequests<T>(items: T[]) {
  await idbPut('saveRequests', { id: 'list', items, updatedAt: Date.now() })
}

// Status viewers
export async function loadCachedViewers<T>(statusId: string): Promise<T[] | null> {
  const row = await idbGet<{ id: string; items: T[] }>('statusViewers', statusId)
  return row?.items ?? null
}

export async function saveCachedViewers<T>(statusId: string, items: T[]) {
  await idbPut('statusViewers', { id: statusId, items, updatedAt: Date.now() })
}

// Outbox — unsent / pending messages
export type OutboxItem = {
  id: string
  conversationId: string
  contactId: string
  text: string
  image?: string | null
  createdAt: string
  payload?: Record<string, unknown>
}

export async function loadOutbox(): Promise<OutboxItem[]> {
  return idbGetAll<OutboxItem>('outbox')
}

export async function putOutbox(item: OutboxItem) {
  await idbPut('outbox', item)
}

export async function removeOutbox(id: string) {
  await idbDelete('outbox', id)
}

// Meta timestamps for incremental sync hints
export async function getMeta(key: string): Promise<number | null> {
  const row = await idbGet<{ id: string; ts: number }>('meta', key)
  return row?.ts ?? null
}

export async function setMeta(key: string, ts: number = Date.now()) {
  await idbPut('meta', { id: key, ts })
}
