/** In-memory message cache — reopen chat without blanking the thread. */

import type { ApiMsg } from '../api'

const MAX_THREADS = 40
const MAX_PER_THREAD = 80

const cache = new Map<string, ApiMsg[]>()

export function getCachedMessages(conversationId: string | null | undefined): ApiMsg[] | null {
  if (!conversationId) return null
  const hit = cache.get(conversationId)
  return hit ? hit.slice() : null
}

export function setCachedMessages(conversationId: string | null | undefined, msgs: ApiMsg[]) {
  if (!conversationId) return
  const trimmed = msgs.slice(-MAX_PER_THREAD)
  if (cache.has(conversationId)) cache.delete(conversationId)
  cache.set(conversationId, trimmed)
  while (cache.size > MAX_THREADS) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function clearMessageCache() {
  cache.clear()
}
