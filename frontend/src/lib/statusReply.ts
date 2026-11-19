/** ASCII-safe status-reply envelope (survives DB / transport better than exotic brackets). */
const ASCII_RE =
  /^\[\[sc:status\|([\s\S]*?)\|([\s\S]*?)\|([\s\S]*?)\]\]([\s\S]*)$/
/** Legacy unicode brackets used in earlier builds */
const UNICODE_RE =
  /^⟦status⟧([\s\S]*?)⟦t⟧([\s\S]*?)(?:⟦id⟧([\s\S]*?))?⟦\/⟧([\s\S]*)$/
/** Corrupted / alternate pipe form seen in some clients */
const PIPE_RE =
  /^\[\[status\|([\s\S]*?)\|t\|([\s\S]*?)\|id\|([\s\S]*?)\|\/\]\]([\s\S]*)$/
/** Double-bracket form without sc: prefix */
const BRACKET_RE =
  /^\[\[status\]\]([\s\S]*?)\[\[t\]\]([\s\S]*?)(?:\[\[id\]\]([\s\S]*?))?\[\[\/\]\]([\s\S]*)$/

export type StatusReplyMeta = {
  preview: string
  time?: string
  statusId?: string
}

export function encodeStatusReply(
  body: string,
  meta: StatusReplyMeta,
): string {
  const preview = String(meta.preview || '').replace(/\|/g, ' ')
  const time = String(meta.time || '').replace(/\|/g, ' ')
  const statusId = String(meta.statusId || '').replace(/\|/g, '')
  return `[[sc:status|${preview}|${time}|${statusId}]]${body || ''}`
}

export function parseStatusReply(raw: string): {
  text: string
  statusReply: StatusReplyMeta | null
} {
  const text = String(raw || '')
  if (!text) return { text: '', statusReply: null }

  let m = text.match(ASCII_RE)
  if (m) {
    return {
      text: m[4] || '',
      statusReply: {
        preview: m[1] || '',
        time: m[2] || undefined,
        statusId: m[3] || undefined,
      },
    }
  }
  m = text.match(UNICODE_RE)
  if (m) {
    return {
      text: m[4] || '',
      statusReply: {
        preview: m[1] || '',
        time: m[2] || undefined,
        statusId: m[3] || undefined,
      },
    }
  }
  m = text.match(PIPE_RE)
  if (m) {
    return {
      text: m[4] || '',
      statusReply: {
        preview: m[1] || '',
        time: m[2] || undefined,
        statusId: m[3] || undefined,
      },
    }
  }
  m = text.match(BRACKET_RE)
  if (m) {
    return {
      text: m[4] || '',
      statusReply: {
        preview: m[1] || '',
        time: m[2] || undefined,
        statusId: m[3] || undefined,
      },
    }
  }
  return { text, statusReply: null }
}

export function statusReplyPreviewLabel(raw: string): string {
  const { text, statusReply } = parseStatusReply(raw)
  if (!statusReply) return raw
  const body = (text || '').trim()
  return body ? `Status reply: ${body}` : 'Status reply'
}
