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

/** ISO-8601 UTC timestamp — industry-style “cached up to” watermark. */
export function utcNowIso(): string {
  return new Date().toISOString()
}

export type CacheListPayload<T> = {
  items: T[]
  /** Exclusive upper bound of what this cache covers (UTC). Next fetch starts after this. */
  syncedAtUtc: string | null
  updatedAt: number
}

async function loadList<T>(store: StoreName): Promise<CacheListPayload<T>> {
  const row = await idbGet<{ id: string; items?: T[]; syncedAtUtc?: string; updatedAt?: number }>(store, 'list')
  return {
    items: (row?.items as T[]) || [],
    syncedAtUtc: row?.syncedAtUtc || null,
    updatedAt: row?.updatedAt || 0,
  }
}

async function saveList<T>(store: StoreName, items: T[], syncedAtUtc?: string | null) {
  const at = syncedAtUtc || utcNowIso()
  await idbPut(store, {
    id: 'list',
    items,
    syncedAtUtc: at,
    updatedAt: Date.now(),
  })
}

// Chats (home list)
export async function loadCachedChats<T>(): Promise<T[]> {
  return (await loadList<T>('chats')).items
}

export async function loadCachedChatsMeta<T>(): Promise<CacheListPayload<T>> {
  return loadList<T>('chats')
}

export async function saveCachedChats<T>(items: T[], syncedAtUtc?: string | null) {
  await saveList('chats', items, syncedAtUtc)
}

// Groups (same stale-while-revalidate pattern as chats)
export async function loadCachedGroups<T>(): Promise<T[]> {
  return (await loadList<T>('groups')).items
}

export async function loadCachedGroupsMeta<T>(): Promise<CacheListPayload<T>> {
  return loadList<T>('groups')
}

export async function saveCachedGroups<T>(items: T[], syncedAtUtc?: string | null) {
  await saveList('groups', items, syncedAtUtc)
}

// Contacts
export async function loadCachedContacts<T>(): Promise<T[]> {
  return (await loadList<T>('contacts')).items
}

export async function loadCachedContactsMeta<T>(): Promise<CacheListPayload<T>> {
  return loadList<T>('contacts')
}

export async function saveCachedContacts<T>(items: T[], syncedAtUtc?: string | null) {
  await saveList('contacts', items, syncedAtUtc)
}

// Messages per conversation (last N) + tip watermark for delta sync
export type ThreadCachePayload<T> = {
  items: T[]
  /** Newest message id present in cache — pass as after_id for delta fetch. */
  tipId: string | null
  /** UTC time this thread was last fully synced. */
  syncedAtUtc: string | null
}

export async function loadCachedThread<T>(conversationId: string): Promise<T[] | null> {
  if (!conversationId) return null
  const row = await idbGet<{ id: string; items: T[] }>('messages', conversationId)
  return row?.items ?? null
}

export async function loadCachedThreadMeta<T>(conversationId: string): Promise<ThreadCachePayload<T>> {
  if (!conversationId) return { items: [], tipId: null, syncedAtUtc: null }
  const row = await idbGet<{
    id: string
    items?: T[]
    tipId?: string
    syncedAtUtc?: string
  }>('messages', conversationId)
  const items = (row?.items as T[]) || []
  const tipId =
    row?.tipId ||
    (items.length ? String((items[items.length - 1] as { id?: string })?.id || '') || null : null)
  return {
    items,
    tipId: tipId || null,
    syncedAtUtc: row?.syncedAtUtc || null,
  }
}

export async function saveCachedThread<T extends { id?: string }>(
  conversationId: string,
  items: T[],
  opts?: { tipId?: string | null; syncedAtUtc?: string | null },
) {
  if (!conversationId) return
  // Keep last 80 for reopen speed
  const trimmed = items.slice(-80)
  const tipId =
    opts?.tipId ||
    (trimmed.length ? String(trimmed[trimmed.length - 1]?.id || '') || null : null)
  await idbPut('messages', {
    id: conversationId,
    items: trimmed,
    tipId,
    syncedAtUtc: opts?.syncedAtUtc || utcNowIso(),
    updatedAt: Date.now(),
  })
}

/**
 * Resource-level sync watermark (e.g. chats / contacts / statuses).
 * Used so a re-login for the same user can skip a full refetch when possible.
 */
export async function getResourceSyncedAt(resource: string): Promise<string | null> {
  const row = await idbGet<{ id: string; syncedAtUtc?: string }>('meta', `sync:${resource}`)
  return row?.syncedAtUtc || null
}

export async function setResourceSyncedAt(resource: string, syncedAtUtc?: string | null) {
  await idbPut('meta', {
    id: `sync:${resource}`,
    syncedAtUtc: syncedAtUtc || utcNowIso(),
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
  return (await loadList<T>('statuses')).items
}

export async function saveCachedStatuses<T>(items: T[], syncedAtUtc?: string | null) {
  await saveList('statuses', items, syncedAtUtc)
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
