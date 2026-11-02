import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB = path.join(__dirname, '..', 'db')

function ensure() {
  if (!fs.existsSync(DB)) fs.mkdirSync(DB, { recursive: true })
  for (const f of ['users.json', 'messages.json', 'groups.json', 'status.json', 'calls.json', 'sessions.json', 'typing.json', 'rings.json']) {
    const p = path.join(DB, f)
    if (!fs.existsSync(p)) {
      const empty = f === 'users.json' || f === 'messages.json' || f === 'groups.json' || f === 'status.json' || f === 'calls.json' || f === 'sessions.json'
        ? (f === 'messages.json' ? {} : [])
        : []
      // messages is object keyed by conversationId
      fs.writeFileSync(p, JSON.stringify(f === 'messages.json' || f === 'typing.json' ? {} : [], null, 2))
    }
  }
}

ensure()

export function read(name) {
  ensure()
  const raw = fs.readFileSync(path.join(DB, name), 'utf8')
  return JSON.parse(raw || (name === 'messages.json' || name === 'typing.json' ? '{}' : '[]'))
}

export function write(name, data) {
  ensure()
  fs.writeFileSync(path.join(DB, name), JSON.stringify(data, null, 2))
}

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function now() {
  return new Date().toISOString()
}

export function timeLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const same =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  if (same) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  const yest = new Date(today)
  yest.setDate(yest.getDate() - 1)
  if (
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  )
    return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short' })
}
