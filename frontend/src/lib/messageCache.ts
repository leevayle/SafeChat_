/** Message thread cache — memory + IndexedDB for instant reopen. */

import type { ApiMsg } from '../api'
import { loadCachedThread, saveCachedThread, removeCachedThread } from './appCache'

const MAX_THREADS = 40
const MAX_PER_THREAD = 80

const mem = new Map<string, ApiMsg[]>()
const writes = new Map<string, Promise<void>>()
let generation = 0

const STATE_RANK: Record<string, number> = {
  pending: 0,
  failed: 0,
  sent: 1,
  delivered: 2,
  read: 3,
}

function sameMessage(a: ApiMsg, b: ApiMsg) {
  return (
    a.id === b.id ||
    (!!a.clientKey && (a.clientKey === b.id || a.clientKey === b.clientKey)) ||
    (!!b.clientKey && b.clientKey === a.id)
  )
}

export function mergeMessageLists(existing: ApiMsg[], updates: ApiMsg[]): ApiMsg[] {
  const merged: ApiMsg[] = []
  for (const message of [...existing, ...updates]) {
    const index = merged.findIndex((item) => sameMessage(item, message))
    if (index < 0) {
      merged.push({ ...message, clientKey: message.clientKey || message.id })
      continue
    }

    const previous = merged[index]
    const state =
      (STATE_RANK[previous.state || ''] || 0) > (STATE_RANK[message.state || ''] || 0)
        ? previous.state
        : message.state || previous.state
    merged[index] = {
      ...previous,
      ...message,
      id: message.id || previous.id,
      clientKey: message.clientKey || previous.clientKey || previous.id,
      mine: message.mine ?? previous.mine,
      state,
      timeLabel: message.timeLabel || previous.timeLabel,
      replyToId: message.replyToId || previous.replyToId,
      replyToText: message.replyToText || previous.replyToText,
    }
  }
  return merged.sort((a, b) => (Date.parse(a.time) || 0) - (Date.parse(b.time) || 0))
}

export function getCachedMessages(conversationId: string | null | undefined): ApiMsg[] | null {
  if (!conversationId) return null
  const hit = mem.get(conversationId)
  return hit ? hit.slice() : null
}

export async function setCachedMessages(
  conversationId: string | null | undefined,
  msgs: ApiMsg[],
) {
  if (!conversationId) return
  const trimmed = msgs.slice(-MAX_PER_THREAD)
  if (mem.has(conversationId)) mem.delete(conversationId)
  mem.set(conversationId, trimmed)
  while (mem.size > MAX_THREADS) {
    const oldest = mem.keys().next().value
    if (oldest === undefined) break
    mem.delete(oldest)
  }
  await saveCachedThread(conversationId, trimmed)
}

/** Merge a live or optimistic message without replacing an unloaded disk cache. */
export async function mergeCachedMessages(
  conversationId: string | null | undefined,
  updates: ApiMsg[],
): Promise<ApiMsg[]> {
  if (!conversationId || !updates.length) return []
  const writeGeneration = generation
  const previousWrite = writes.get(conversationId) || Promise.resolve()
  let result: ApiMsg[] = []
  const currentWrite = previousWrite
    .catch(() => {})
    .then(async () => {
      if (writeGeneration !== generation) return
      const current =
        getCachedMessages(conversationId) ||
        (await hydrateThreadFromDisk(conversationId)) ||
        []
      if (writeGeneration !== generation) return
      result = mergeMessageLists(current, updates).slice(-MAX_PER_THREAD)
      await setCachedMessages(conversationId, result)
    })
  writes.set(conversationId, currentWrite)
  await currentWrite
  if (writes.get(conversationId) === currentWrite) writes.delete(conversationId)
  return result
}

/** Hydrate one thread from IndexedDB into memory (call before first paint of chat). */
export async function hydrateThreadFromDisk(conversationId: string): Promise<ApiMsg[] | null> {
  if (!conversationId) return null
  if (mem.has(conversationId)) return mem.get(conversationId)!.slice()
  const loadGeneration = generation
  const disk = await loadCachedThread<ApiMsg>(conversationId)
  if (loadGeneration !== generation) return null
  const current = mem.get(conversationId) || []
  const merged = mergeMessageLists(disk || [], current).slice(-MAX_PER_THREAD)
  if (merged.length) mem.set(conversationId, merged)
  return merged.length ? merged.slice() : null
}

export function clearMessageCache() {
  generation += 1
  mem.clear()
  writes.clear()
}

/** Drop one conversation from memory + IndexedDB after server confirms delete. */
export async function removeConversationCache(conversationId: string | null | undefined) {
  if (!conversationId) return
  generation += 1
  mem.delete(conversationId)
  writes.delete(conversationId)
  try {
    await removeCachedThread(conversationId)
  } catch {
    /* ignore cache errors */
  }
}
