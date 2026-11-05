/** Message thread cache — memory + IndexedDB for instant reopen. */

import type { ApiMsg } from '../api'
import { loadCachedThread, saveCachedThread } from './appCache'

const MAX_THREADS = 40
const MAX_PER_THREAD = 80

const mem = new Map<string, ApiMsg[]>()

export function getCachedMessages(conversationId: string | null | undefined): ApiMsg[] | null {
  if (!conversationId) return null
  const hit = mem.get(conversationId)
  return hit ? hit.slice() : null
}

export function setCachedMessages(conversationId: string | null | undefined, msgs: ApiMsg[]) {
  if (!conversationId) return
  const trimmed = msgs.slice(-MAX_PER_THREAD)
  if (mem.has(conversationId)) mem.delete(conversationId)
  mem.set(conversationId, trimmed)
  while (mem.size > MAX_THREADS) {
    const oldest = mem.keys().next().value
    if (oldest === undefined) break
    mem.delete(oldest)
  }
  void saveCachedThread(conversationId, trimmed)
}

/** Hydrate one thread from IndexedDB into memory (call before first paint of chat). */
export async function hydrateThreadFromDisk(conversationId: string): Promise<ApiMsg[] | null> {
  if (!conversationId) return null
  if (mem.has(conversationId)) return mem.get(conversationId)!.slice()
  const disk = await loadCachedThread<ApiMsg>(conversationId)
  if (disk && disk.length) {
    mem.set(conversationId, disk.slice(-MAX_PER_THREAD))
    return disk.slice()
  }
  return null
}

export function clearMessageCache() {
  mem.clear()
}
