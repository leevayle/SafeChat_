/**
 * SafeChat JSON-file backend
 * Run: node server/index.js  (or npm run server)
 */
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { read, write, uid, now, timeLabel } from './lib/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS = path.join(__dirname, 'uploads')

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
}
ensureDir(UPLOADS)

/** phone/user id → hex folder name */
function hexKey(s) {
  return Buffer.from(String(s).replace(/\s/g, '')).toString('hex').slice(0, 48)
}

function saveDataUrl(dataUrl, folder, basename) {
  ensureDir(folder)
  const m = String(dataUrl).match(/^data:(image\/\w+);base64,(.+)$/)
  if (!m) throw new Error('Invalid image data')
  const ext = m[1].split('/')[1].replace('jpeg', 'jpg')
  const file = `${basename}.${ext}`
  const full = path.join(folder, file)
  fs.writeFileSync(full, Buffer.from(m[2], 'base64'))
  return `/uploads/${path.relative(UPLOADS, full).replace(/\\/g, '/')}`
}

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '12mb' }))
app.use('/uploads', express.static(UPLOADS))

// ── helpers ──────────────────────────────────────────────
function publicUser(u) {
  if (!u) return null
  const { settings, ...rest } = u
  return rest
}

function convKey(a, b) {
  return [a, b].sort().join(':')
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const sessions = read('sessions.json')
  const s = sessions.find((x) => x.token === token)
  if (!s) return res.status(401).json({ error: 'Invalid session' })
  const users = read('users.json')
  const user = users.find((u) => u.id === s.userId)
  if (!user) return res.status(401).json({ error: 'User gone' })
  req.user = user
  req.token = token
  next()
}

const HUES = [
  ['#9C31A1', '#7B2CBF'],
  ['#F97316', '#E3404C'],
  ['#6389EB', '#7B2CBF'],
  ['#F97316', '#9C31A1'],
  ['#E3404C', '#9C31A1'],
  ['#6389EB', '#9C31A1'],
]

// ── Auth ─────────────────────────────────────────────────
app.post('/api/register', (req, res) => {
  const { phone, countryCode, username, name, bio, photo } = req.body || {}
  if (!phone || !username) return res.status(400).json({ error: 'phone and username required' })
  const users = read('users.json')
  const cleanPhone = String(phone).replace(/\s/g, '')
  if (users.some((u) => u.phone === cleanPhone || u.phone === (countryCode || '') + cleanPhone.replace(/^\+/, ''))) {
    return res.status(409).json({ error: 'Phone already registered' })
  }
  if (users.some((u) => u.username.toLowerCase() === String(username).toLowerCase().replace(/^@/, ''))) {
    return res.status(409).json({ error: 'Username taken' })
  }
  const id = uid('u')
  const user = {
    id,
    phone: cleanPhone.startsWith('+') ? cleanPhone : (countryCode || '') + cleanPhone,
    countryCode: countryCode || '+254',
    username: String(username).replace(/^@/, '').toLowerCase(),
    name: name || username,
    bio: bio || 'Hey there! I am using SafeChat.',
    photo: photo || null,
    online: true,
    hue: HUES[users.length % HUES.length],
    createdAt: now(),
    settings: {
      lastSeen: 'My contacts',
      readReceipts: true,
      typingIndicator: true,
      msgNotif: true,
      groupNotif: true,
      callNotif: true,
      wallpaper: 'Cloud',
      fontSize: 'Medium',
      enterIsSend: true,
    },
  }
  users.push(user)
  write('users.json', users)

  const token = uid('tok')
  const sessions = read('sessions.json')
  sessions.push({ token, userId: id, createdAt: now() })
  write('sessions.json', sessions)

  res.json({ token, user: publicUser(user) })
})

app.post('/api/login', (req, res) => {
  const { phone, username } = req.body || {}
  const users = read('users.json')
  let user = null
  if (phone) {
    const p = String(phone).replace(/\s/g, '')
    user = users.find((u) => u.phone.replace(/\s/g, '') === p || u.phone.endsWith(p.replace(/^\+/, '')))
  }
  if (!user && username) {
    user = users.find((u) => u.username === String(username).toLowerCase().replace(/^@/, ''))
  }
  if (!user) return res.status(404).json({ error: 'User not found. Register first.' })

  user.online = true
  write(
    'users.json',
    users.map((u) => (u.id === user.id ? user : u)),
  )

  const token = uid('tok')
  const sessions = read('sessions.json')
  sessions.push({ token, userId: user.id, createdAt: now() })
  write('sessions.json', sessions)

  res.json({ token, user: publicUser(user) })
})

app.post('/api/logout', auth, (req, res) => {
  const sessions = read('sessions.json').filter((s) => s.token !== req.token)
  write('sessions.json', sessions)
  const users = read('users.json')
  write(
    'users.json',
    users.map((u) => (u.id === req.user.id ? { ...u, online: false } : u)),
  )
  res.json({ ok: true })
})

app.get('/api/me', auth, (req, res) => {
  res.json({ user: publicUser(req.user), settings: req.user.settings })
})

app.patch('/api/me', auth, (req, res) => {
  const users = read('users.json')
  const idx = users.findIndex((u) => u.id === req.user.id)
  if (idx < 0) return res.status(404).json({ error: 'Not found' })
  const { name, username, bio, photo, settings } = req.body || {}
  if (name !== undefined) users[idx].name = name
  if (username !== undefined) {
    const un = String(username).replace(/^@/, '').toLowerCase()
    if (users.some((u) => u.id !== req.user.id && u.username === un)) {
      return res.status(409).json({ error: 'Username taken' })
    }
    users[idx].username = un
  }
  if (bio !== undefined) users[idx].bio = bio
  if (photo !== undefined) users[idx].photo = photo
  if (settings && typeof settings === 'object') {
    users[idx].settings = { ...users[idx].settings, ...settings }
  }
  write('users.json', users)
  res.json({ user: publicUser(users[idx]), settings: users[idx].settings })
})

// ── Contacts / users ─────────────────────────────────────
app.get('/api/users', auth, (req, res) => {
  const users = read('users.json')
  res.json({
    users: users.filter((u) => u.id !== req.user.id).map(publicUser),
  })
})

app.get('/api/users/:id', auth, (req, res) => {
  const users = read('users.json')
  const u = users.find((x) => x.id === req.params.id || x.username === req.params.id)
  if (!u) return res.status(404).json({ error: 'Not found' })
  res.json({ user: publicUser(u) })
})

// ── Chats / messages ─────────────────────────────────────
app.get('/api/chats', auth, (req, res) => {
  const me = req.user.id
  const messages = read('messages.json')
  const users = read('users.json')
  const previews = []

  for (const [key, msgs] of Object.entries(messages)) {
    if (!key.includes(me) || !Array.isArray(msgs) || msgs.length === 0) continue
    const otherId = key.split(':').find((id) => id !== me)
    const other = users.find((u) => u.id === otherId)
    if (!other) continue
    const last = msgs[msgs.length - 1]
    const unread = msgs.filter((m) => m.to === me && m.state !== 'read').length
    previews.push({
      contactId: otherId,
      last: last.text || (last.image ? 'Photo' : ''),
      time: timeLabel(last.time),
      unread,
      mine: last.from === me,
      state: last.state || 'sent',
      iso: last.time,
    })
  }

  previews.sort((a, b) => new Date(b.iso) - new Date(a.iso))
  res.json({ chats: previews })
})

app.get('/api/messages/:contactId', auth, (req, res) => {
  const me = req.user.id
  const other = req.params.contactId
  const key = convKey(me, other)
  const messages = read('messages.json')
  const list = (messages[key] || []).map((m) => ({
    ...m,
    mine: m.from === me,
    timeLabel: timeLabel(m.time),
  }))

  // mark as read
  let changed = false
  for (const m of messages[key] || []) {
    if (m.to === me && m.state !== 'read') {
      m.state = 'read'
      changed = true
    }
  }
  if (changed) write('messages.json', messages)

  res.json({ messages: list })
})

app.post('/api/messages/:contactId', auth, (req, res) => {
  const me = req.user.id
  const other = req.params.contactId
  const text = (req.body?.text || '').trim()
  const imageData = req.body?.image
  if (!text && !imageData) return res.status(400).json({ error: 'Empty message' })

  const users = read('users.json')
  if (!users.some((u) => u.id === other)) return res.status(404).json({ error: 'Contact not found' })

  const key = convKey(me, other)
  const messages = read('messages.json')
  if (!messages[key]) messages[key] = []

  let imageUrl = null
  if (imageData) {
    try {
      const folder = path.join(UPLOADS, 'users', hexKey(req.user.phone || me), 'chats')
      imageUrl = saveDataUrl(imageData, folder, hexKey(me + other) + '_' + Date.now().toString(36))
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Image save failed' })
    }
  }

  const msg = {
    id: uid('m'),
    from: me,
    to: other,
    text: text || (imageUrl ? '📷 Photo' : ''),
    image: imageUrl,
    time: now(),
    state: 'sent',
  }
  messages[key].push(msg)
  write('messages.json', messages)

  // simulate delivery + optional auto-reply from seed bots
  setTimeout(() => {
    const msgs = read('messages.json')
    const arr = msgs[key] || []
    const found = arr.find((m) => m.id === msg.id)
    if (found) found.state = 'delivered'
    write('messages.json', msgs)
  }, 400)

  // lightweight bot reply for demo users (not real registered humans)
  const seedIds = new Set(['amina', 'brian', 'daisy', 'chen', 'emeka', 'fatma', 'joel', 'liam'])
  if (seedIds.has(other)) {
    setTimeout(() => {
      const msgs = read('messages.json')
      if (!msgs[key]) msgs[key] = []
      const replies = [
        'Sounds great!',
        'Got it 👍',
        'Haha yes!',
        'On it.',
        'Talk soon!',
        'Perfect.',
        'Thanks for the update.',
      ]
      msgs[key].push({
        id: uid('m'),
        from: other,
        to: me,
        text: replies[Math.floor(Math.random() * replies.length)],
        time: now(),
        state: 'delivered',
      })
      // mark original as read
      const orig = msgs[key].find((m) => m.id === msg.id)
      if (orig) orig.state = 'read'
      write('messages.json', msgs)
    }, 1800 + Math.random() * 1500)
  }

  res.json({
    message: { ...msg, mine: true, timeLabel: timeLabel(msg.time) },
  })
})

// ── Groups ───────────────────────────────────────────────
app.get('/api/groups', auth, (req, res) => {
  const groups = read('groups.json')
  const mine = groups.filter((g) => g.members.some((m) => m.id === req.user.id))
  res.json({
    groups: mine.map((g) => ({
      ...g,
      unread: (g.messages || []).filter((m) => m.from !== req.user.id && !m.system).length % 5,
    })),
  })
})

app.get('/api/groups/:id', auth, (req, res) => {
  const groups = read('groups.json')
  const g = groups.find((x) => x.id === req.params.id)
  if (!g) return res.status(404).json({ error: 'Not found' })
  if (!g.members.some((m) => m.id === req.user.id)) return res.status(403).json({ error: 'Not a member' })
  res.json({ group: g })
})

app.post('/api/groups', auth, (req, res) => {
  const { name, desc, memberIds, hue } = req.body || {}
  if (!name) return res.status(400).json({ error: 'Name required' })
  const groups = read('groups.json')
  const id = uid('g')
  const members = [{ id: req.user.id, admin: true }]
  for (const mid of memberIds || []) {
    if (mid !== req.user.id && !members.some((m) => m.id === mid)) members.push({ id: mid, admin: false })
  }
  const group = {
    id,
    name,
    desc: desc || '',
    hue: hue || HUES[groups.length % HUES.length],
    muted: false,
    pinned: false,
    adminOnly: false,
    disappearing: 'Off',
    invite: Math.random().toString(36).slice(2, 8),
    members,
    messages: [
      {
        id: uid('gm'),
        from: req.user.id,
        text: 'created this group',
        time: now(),
        system: true,
      },
    ],
  }
  groups.unshift(group)
  write('groups.json', groups)
  res.json({ group })
})

app.post('/api/groups/:id/messages', auth, (req, res) => {
  const groups = read('groups.json')
  const idx = groups.findIndex((g) => g.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'Not found' })
  if (!groups[idx].members.some((m) => m.id === req.user.id)) return res.status(403).json({ error: 'Not a member' })
  const text = (req.body?.text || '').trim()
  if (!text) return res.status(400).json({ error: 'Empty' })
  const msg = { id: uid('gm'), from: req.user.id, text, time: now() }
  groups[idx].messages.push(msg)
  write('groups.json', groups)
  res.json({ message: msg })
})

app.patch('/api/groups/:id', auth, (req, res) => {
  const groups = read('groups.json')
  const idx = groups.findIndex((g) => g.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'Not found' })
  const me = groups[idx].members.find((m) => m.id === req.user.id)
  if (!me) return res.status(403).json({ error: 'Not a member' })
  const { name, desc, muted, pinned, adminOnly, disappearing } = req.body || {}
  if (name !== undefined && me.admin) groups[idx].name = name
  if (desc !== undefined && me.admin) groups[idx].desc = desc
  if (muted !== undefined) groups[idx].muted = muted
  if (pinned !== undefined) groups[idx].pinned = pinned
  if (adminOnly !== undefined && me.admin) groups[idx].adminOnly = adminOnly
  if (disappearing !== undefined && me.admin) groups[idx].disappearing = disappearing
  write('groups.json', groups)
  res.json({ group: groups[idx] })
})

app.post('/api/groups/join', auth, (req, res) => {
  const code = (req.body?.code || '').trim()
  const groups = read('groups.json')
  const g = groups.find((x) => x.invite === code)
  if (!g) return res.status(404).json({ error: 'Invalid invite' })
  if (!g.members.some((m) => m.id === req.user.id)) {
    g.members.push({ id: req.user.id, admin: false })
    g.messages.push({
      id: uid('gm'),
      from: req.user.id,
      text: 'joined using this group’s invite link',
      time: now(),
      system: true,
    })
    write('groups.json', groups)
  }
  res.json({ group: g })
})

app.delete('/api/groups/:id', auth, (req, res) => {
  let groups = read('groups.json')
  const g = groups.find((x) => x.id === req.params.id)
  if (!g) return res.status(404).json({ error: 'Not found' })
  const me = g.members.find((m) => m.id === req.user.id)
  if (!me?.admin) return res.status(403).json({ error: 'Admins only' })
  groups = groups.filter((x) => x.id !== req.params.id)
  write('groups.json', groups)
  res.json({ ok: true })
})

// ── Status ───────────────────────────────────────────────
app.get('/api/status', auth, (req, res) => {
  const status = read('status.json')
  const users = read('users.json')
  // only last 24h
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const fresh = status.filter((s) => new Date(s.createdAt).getTime() > cutoff)
  res.json({
    status: fresh.map((s) => ({
      ...s,
      user: publicUser(users.find((u) => u.id === s.userId)),
      ago: timeAgo(s.createdAt),
    })),
  })
})

app.post('/api/status', auth, (req, res) => {
  const text = (req.body?.text || '').trim()
  const imageData = req.body?.image
  if (!text && !imageData) return res.status(400).json({ error: 'Empty status' })
  let imageUrl = null
  if (imageData) {
    try {
      const folder = path.join(UPLOADS, 'users', hexKey(req.user.phone || req.user.id), 'status')
      imageUrl = saveDataUrl(imageData, folder, hexKey(req.user.id) + '_' + Date.now().toString(36))
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Image save failed' })
    }
  }
  const status = read('status.json')
  const item = {
    id: uid('s'),
    userId: req.user.id,
    text: text || '',
    image: imageUrl,
    createdAt: now(),
    views: [],
  }
  status.unshift(item)
  write('status.json', status)
  res.json({ status: item })
})

app.post('/api/status/:id/view', auth, (req, res) => {
  const status = read('status.json')
  const s = status.find((x) => x.id === req.params.id)
  if (!s) return res.status(404).json({ error: 'Not found' })
  if (!s.views.includes(req.user.id) && s.userId !== req.user.id) {
    s.views.push(req.user.id)
    write('status.json', status)
  }
  res.json({ ok: true, views: s.views.length })
})

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Calls log ────────────────────────────────────────────
app.get('/api/calls', auth, (req, res) => {
  const calls = read('calls.json')
  const users = read('users.json')
  const mine = calls
    .filter((c) => c.from === req.user.id || c.to === req.user.id)
    .map((c) => {
      const otherId = c.from === req.user.id ? c.to : c.from
      const other = users.find((u) => u.id === otherId)
      const direction =
        c.direction ||
        c.dir ||
        (c.status === 'missed' ? 'missed' : c.from === req.user.id ? 'out' : 'in')
      return {
        ...c,
        contactId: otherId,
        name: other?.name || otherId,
        contact: publicUser(other),
        direction,
        time: timeLabel(c.when || c.at),
        whenLabel: timeLabel(c.when || c.at),
      }
    })
    .sort((a, b) => new Date(b.when) - new Date(a.when))
  res.json({ calls: mine })
})

app.post('/api/calls', auth, (req, res) => {
  const { to, kind, status, duration } = req.body || {}
  if (!to) return res.status(400).json({ error: 'to required' })
  const calls = read('calls.json')
  const entry = {
    id: uid('c'),
    from: req.user.id,
    to,
    dir: status === 'missed' ? 'missed' : 'out',
    direction: status === 'missed' ? 'missed' : 'out',
    kind: kind === 'video' ? 'video' : 'audio',
    when: now(),
    duration: duration || undefined,
    status: status || 'outgoing',
  }
  calls.unshift(entry)
  write('calls.json', calls)
  res.json({ call: entry })
})

// ── Health ───────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'safechat' }))


// ── Typing indicators ────────────────────────────────────
app.post('/api/typing/:contactId', auth, (req, res) => {
  const typing = read('typing.json')
  const key = convKey(req.user.id, req.params.contactId)
  typing[key] = { from: req.user.id, at: Date.now() }
  write('typing.json', typing)
  res.json({ ok: true })
})

app.get('/api/typing/:contactId', auth, (req, res) => {
  const typing = read('typing.json')
  const key = convKey(req.user.id, req.params.contactId)
  const row = typing[key]
  const active =
    row &&
    row.from === req.params.contactId &&
    Date.now() - row.at < 3500
  res.json({ typing: !!active })
})

// ── Call signalling (JSON poll) ──────────────────────────
app.post('/api/calls/ring', auth, (req, res) => {
  const { to, kind } = req.body || {}
  if (!to) return res.status(400).json({ error: 'Missing to' })
  const rings = read('rings.json')
  const item = {
    id: uid('r'),
    from: req.user.id,
    to,
    kind: kind === 'video' ? 'video' : 'audio',
    status: 'ringing',
    at: Date.now(),
  }
  rings.push(item)
  // keep last 50
  write('rings.json', rings.slice(-50))
  res.json({ ring: item })
})

app.get('/api/calls/incoming', auth, (req, res) => {
  const rings = read('rings.json')
  const me = req.user.id
  const now = Date.now()
  const incoming = rings.filter(
    (r) => r.to === me && r.status === 'ringing' && now - r.at < 45000,
  )
  res.json({ incoming })
})

app.get('/api/calls/ring/:id', auth, (req, res) => {
  const rings = read('rings.json')
  const r = rings.find((x) => x.id === req.params.id)
  if (!r) return res.status(404).json({ error: 'Not found' })
  res.json({ ring: r })
})

app.post('/api/calls/:id/answer', auth, (req, res) => {
  const rings = read('rings.json')
  const r = rings.find((x) => x.id === req.params.id)
  if (!r) return res.status(404).json({ error: 'Not found' })
  r.status = req.body?.status === 'declined' ? 'declined' : 'accepted'
  write('rings.json', rings)
  if (r.status === 'accepted') {
    const calls = read('calls.json')
    calls.unshift({
      id: uid('c'),
      contactId: r.from,
      name: '',
      kind: r.kind,
      status: 'answered',
      direction: 'in',
      time: timeLabel(now()),
      at: now(),
      userId: req.user.id,
    })
    write('calls.json', calls.slice(0, 100))
  }
  res.json({ ring: r })
})


app.listen(PORT, () => {
  console.log(`SafeChat API → http://localhost:${PORT}`)
})
