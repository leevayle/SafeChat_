/**
 * Preferences / small flags (IndexedDB only).
 * Separate from app data cache (appCache.ts → safechat_cache_v1).
 * Auth: access = memory; refresh = HttpOnly cookie. Never localStorage.
 */
const DB_NAME = 'safechat_kv_v1'
const STORE = 'kv'

type Entry = { id: string; value: string }

const mem = new Map<string, string>()
let hydrated = false
let hydratePromise: Promise<void> | null = null
let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no idb'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('kv open failed'))
  })
  return dbPromise
}

async function idbGetAll(): Promise<Entry[]> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const r = tx.objectStore(STORE).getAll()
      r.onsuccess = () => resolve((r.result as Entry[]) || [])
      r.onerror = () => reject(r.error)
    })
  } catch {
    return []
  }
}

async function idbPut(id: string, value: string) {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ id, value })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* */
  }
}

async function idbDel(id: string) {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* */
  }
}

/** Call once at app boot before rendering authenticated UI. */
export function hydrateKv(): Promise<void> {
  if (hydrated) return Promise.resolve()
  if (hydratePromise) return hydratePromise
  hydratePromise = (async () => {
    try {
      const rows = await idbGetAll()
      for (const r of rows) {
        if (r?.id != null && r.value != null) mem.set(String(r.id), String(r.value))
      }
    } catch {
      /* */
    }
    hydrated = true
  })()
  return hydratePromise
}

export function kvGet(key: string): string | null {
  if (mem.has(key)) return mem.get(key) ?? null
  return null
}

export function kvSet(key: string, value: string): void {
  mem.set(key, value)
  void idbPut(key, value)
}

export function kvRemove(key: string): void {
  mem.delete(key)
  void idbDel(key)
}

export function kvGetJson<T>(key: string, fallback: T): T {
  const raw = kvGet(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function kvSetJson(key: string, value: unknown): void {
  kvSet(key, JSON.stringify(value))
}
