/**
 * Central message store — single source of truth for thread messages.
 * Backed by messageCache (memory + IndexedDB). UI subscribes per conversation.
 */

import type { ApiMsg } from '../api'
import {
  getCachedMessages,
  hydrateThreadFromDisk,
  mergeCachedMessages,
  mergeMessageLists,
  removeConversationCache,
  setCachedMessages,
} from './messageCache'

type Listener = (msgs: ApiMsg[]) => void

const listeners = new Map<string, Set<Listener>>()
const cursors = new Map<string, string | null>() // oldest loaded id / next before cursor
const loadingOlder = new Set<string>()

function emit(conversationId: string, msgs: ApiMsg[]) {
  const set = listeners.get(conversationId)
  if (!set) return
  for (const fn of set) {
    try {
      fn(msgs.slice())
    } catch {
      /* listener errors must not break the store */
    }
  }
}

export function getThreadMessages(conversationId: string | null | undefined): ApiMsg[] {
  if (!conversationId) return []
  return getCachedMessages(conversationId) || []
}

export function getThreadCursor(conversationId: string | null | undefined): string | null {
  if (!conversationId) return null
  return cursors.get(conversationId) ?? null
}

export function setThreadCursor(conversationId: string, cursor: string | null) {
  cursors.set(conversationId, cursor)
}

export function subscribeThread(conversationId: string, listener: Listener): () => void {
  let set = listeners.get(conversationId)
  if (!set) {
    set = new Set()
    listeners.set(conversationId, set)
  }
  set.add(listener)
  const current = getCachedMessages(conversationId)
  if (current?.length) listener(current.slice())
  return () => {
    set!.delete(listener)
    if (!set!.size) listeners.delete(conversationId)
  }
}

/** Replace or merge messages for a thread and notify subscribers. */
export async function applyThreadMessages(
  conversationId: string,
  updates: ApiMsg[],
  mode: 'merge' | 'replace' = 'merge',
): Promise<ApiMsg[]> {
  if (!conversationId) return []
  let result: ApiMsg[]
  if (mode === 'replace') {
    await setCachedMessages(conversationId, updates)
    result = updates.slice()
  } else {
    result = await mergeCachedMessages(conversationId, updates)
  }
  emit(conversationId, result)
  return result
}

export async function applyOptimisticMessage(conversationId: string, msg: ApiMsg): Promise<ApiMsg[]> {
  return applyThreadMessages(conversationId, [msg], 'merge')
}

export async function applyAck(
  conversationId: string,
  clientKey: string,
  serverId: string,
  state?: string,
): Promise<ApiMsg[]> {
  const current = getCachedMessages(conversationId) || []
  const updates = current
    .filter((m) => m.clientKey === clientKey || m.id === clientKey || m.id === serverId)
    .map((m) => ({
      ...m,
      id: serverId || m.id,
      clientKey: clientKey || m.clientKey,
      state: (state as ApiMsg['state']) || m.state || 'sent',
    }))
  if (!updates.length) {
    return applyThreadMessages(
      conversationId,
      [
        {
          id: serverId,
          clientKey,
          conversationId,
          from: '',
          text: '',
          time: new Date().toISOString(),
          state: (state as ApiMsg['state']) || 'sent',
          mine: true,
        } as ApiMsg,
      ],
      'merge',
    )
  }
  return applyThreadMessages(conversationId, updates, 'merge')
}

export async function applyReceipt(
  conversationId: string,
  messageId: string,
  state: string,
): Promise<ApiMsg[]> {
  const current = getCachedMessages(conversationId) || []
  const hit = current.find((m) => m.id === messageId || m.clientKey === messageId)
  if (!hit) return current
  return applyThreadMessages(
    conversationId,
    [{ ...hit, state: state as ApiMsg['state'] }],
    'merge',
  )
}

export async function hydrateThread(conversationId: string): Promise<ApiMsg[]> {
  const disk = await hydrateThreadFromDisk(conversationId)
  const msgs = disk || getCachedMessages(conversationId) || []
  if (msgs.length) emit(conversationId, msgs)
  return msgs
}

export function isLoadingOlder(conversationId: string): boolean {
  return loadingOlder.has(conversationId)
}

export function markLoadingOlder(conversationId: string, on: boolean) {
  if (on) loadingOlder.add(conversationId)
  else loadingOlder.delete(conversationId)
}

/** Merge older page (prepend chronologically via mergeMessageLists). */
export async function prependOlderMessages(
  conversationId: string,
  older: ApiMsg[],
  nextCursor: string | null,
): Promise<ApiMsg[]> {
  const result = await applyThreadMessages(conversationId, older, 'merge')
  setThreadCursor(conversationId, nextCursor)
  return result
}

export async function dropThread(conversationId: string) {
  await removeConversationCache(conversationId)
  cursors.delete(conversationId)
  emit(conversationId, [])
}

/** Build inbox preview fields from the latest message in a thread. */
export function previewFromThread(conversationId: string | null | undefined): {
  last: string
  iso?: string
  state?: string
  mine?: boolean
} | null {
  if (!conversationId) return null
  const msgs = getCachedMessages(conversationId)
  if (!msgs?.length) return null
  const last = msgs[msgs.length - 1] as any
  const body = String(last.text ?? last.content ?? '').trim()
  let lastText = body || (last.image ? '📷 Photo' : '')
  if (!lastText && last.deleted) lastText = 'Message deleted'
  if (!lastText) lastText = 'Message'
  // Strip status-reply envelope for the home row
  const sr = lastText.match(/^⟦status⟧([\s\S]*?)⟦t⟧([\s\S]*?)(?:⟦id⟧([\s\S]*?))?⟦\/⟧([\s\S]*)$/)
  if (sr) {
    const replyBody = (sr[4] || '').trim()
    lastText = replyBody ? `Status reply: ${replyBody}` : 'Status reply'
  }
  return {
    last: lastText,
    iso: last.time,
    state: last.state,
    mine: last.mine,
  }
}

export function mergeLocalLists(a: ApiMsg[], b: ApiMsg[]): ApiMsg[] {
  return mergeMessageLists(a, b)
}
