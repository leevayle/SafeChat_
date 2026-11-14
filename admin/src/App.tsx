import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  CreditCard,
  FileClock,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Monitor,
  Moon,
  RefreshCw,
  Send,
  Settings,
  Sun,
  Menu,
  MoreHorizontal,
  Search,
  Shield,
  ShieldCheck,
  Users,
  Trash2,
  X,
  HardDrive,
  Database,
  Download,
  Play,
  Layers,
  FolderArchive,
  Archive,
  Contact,
} from 'lucide-react'

type Role = 'ADMIN' | 'SUPER_ADMIN'
type Section = 'overview' | 'users' | 'payments' | 'access' | 'support' | 'reports' | 'audit' | 'backup' | 'settings'
type ThemePreference = 'system' | 'light' | 'dark'
type ToastMessage = { message: string; tone: 'success' | 'error' | 'info' }
type Envelope<T> = { success?: boolean; message?: string; data?: T }
type AdminUser = {
  id: string
  username: string
  display_name: string
  email?: string | null
  phone_number?: string | null
  account_role: string
  account_status: string
  subscription_plan: string
  premium_expires_at?: string | null
  verification_status: string
  verified_badge: boolean
  created_at?: string | null
  last_seen?: string | null
  online: boolean
}
type Page<T> = { items: T[]; total: number; page: number; page_size: number }
type AdminPayment = {
  id: string
  username?: string
  display_name?: string
  provider?: string
  plan?: string
  amount?: number
  currency: string
  status?: string
  checkout_request_id?: string
  created_at?: string | null
  paid_at?: string | null
}
type RoleRequest = {
  id: string
  target_user_id: string
  target_username?: string
  target_role?: string
  requester_username?: string
  reason: string
  status: string
  created_at?: string | null
}
type AdminReport = {
  id: string
  reporter_id?: string
  target_type?: string
  target_id?: string
  reason?: string
  status?: string
  created_at?: string | null
}
type SupportInboxTicket = {
  id: string
  user_id: string
  username?: string
  display_name?: string
  subject: string
  body: string
  status: 'pending' | 'in_progress' | 'closed'
  assigned_admin_id?: string | null
  assigned_admin_username?: string | null
  created_at?: string | null
  updated_at?: string | null
  assignment_history?: { admin_id?: string; username?: string; assigned_by?: string; assigned_at?: string | null }[]
  replies: { id: string; author_role: string; author_username?: string; body: string; created_at?: string | null }[]
}
type AuditEntry = {
  id: string
  actor_id?: string
  actor_username?: string | null
  actor_role?: string
  action?: string
  resource_type?: string
  resource_id?: string
  metadata?: Record<string, unknown>
  timestamp?: string | null
}
type Overview = {
  users: {
    total: number
    active: number
    online: number
    deactivated: number
    banned: number
    pending_review: number
    premium: number
    pro: number
  }
  payments: { total: number; paid_last_30_days: number }
  reports_open: number
  support_tickets_open: number
}
type Health = { api: string; mongodb: string; checked_at: string }

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
let accessToken = ''
let refreshTask: Promise<boolean> | null = null

function refreshAccessToken(): Promise<boolean> {
  if (!refreshTask) {
    refreshTask = fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).then(async (response) => {
      const envelope = (await response.json().catch(() => ({}))) as Envelope<{ access_token?: string }>
      if (!response.ok || !envelope.data?.access_token) return false
      accessToken = envelope.data.access_token
      return true
    }).finally(() => {
      refreshTask = null
    })
  }
  return refreshTask
}

async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body != null) headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })
  if (response.status === 401 && !retried && accessToken) {
    if (await refreshAccessToken()) {
      return request<T>(path, init, true)
    }
    accessToken = ''
    window.dispatchEvent(new Event('admin:session-expired'))
    throw new Error('Session expired. Please sign in again.')
  }
  const envelope = (await response.json().catch(() => ({}))) as Envelope<T>
  if (!response.ok || envelope.success === false) {
    throw new Error(envelope.message || `Request failed (${response.status})`)
  }
  return envelope.data as T
}

function jsonBody(value: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(value) }
}

function dateLabel(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function money(value?: number, currency = 'KES') {
  if (value == null) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}

function initials(name?: string) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

const navGroups: { label: string; items: { id: Section; label: string; icon: typeof LayoutDashboard }[] }[] = [
  { label: 'Workspace', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
  { label: 'Manage', items: [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'access', label: 'Access control', icon: ShieldCheck },
  ] },
  { label: 'Trust & safety', items: [
    { id: 'support', label: 'Support inbox', icon: MessageCircle },
    { id: 'reports', label: 'Reports', icon: LifeBuoy },
    { id: 'audit', label: 'Audit log', icon: FileClock },
  ] },
  { label: 'Data', items: [{ id: 'backup', label: 'Backup', icon: HardDrive }] },
  { label: 'Preferences', items: [{ id: 'settings', label: 'Settings', icon: Settings }] },
]
const navItems = navGroups.flatMap((group) => group.items)

function notifyAdmin(message: string, tone: ToastMessage['tone'] = 'success') {
  window.dispatchEvent(new CustomEvent<ToastMessage>('admin:toast', { detail: { message, tone } }))
}

export default function App() {
  const [admin, setAdmin] = useState<{ username: string; role: Role } | null>(null)
  const [section, setSection] = useState<Section>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [presenceState, setPresenceState] = useState<'connecting' | 'active' | 'offline'>('connecting')
  const [theme, setTheme] = useState<ThemePreference>(() => {
    const saved = window.localStorage.getItem('safechat-admin-theme')
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  })
  const [toast, setToast] = useState<ToastMessage | null>(null)

  useEffect(() => {
    const logout = () => {
      accessToken = ''
      setAdmin(null)
      setNotice('Your session expired. Sign in again.')
    }
    window.addEventListener('admin:session-expired', logout)
    return () => window.removeEventListener('admin:session-expired', logout)
  }, [])

  useEffect(() => {
    let timer = 0
    const receiveToast = (event: Event) => {
      const message = (event as CustomEvent<ToastMessage>).detail
      setToast(message)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setToast(null), 3600)
    }
    window.addEventListener('admin:toast', receiveToast)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('admin:toast', receiveToast)
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      document.documentElement.dataset.theme = theme === 'system'
        ? (media.matches ? 'dark' : 'light')
        : theme
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  useEffect(() => {
    if (!admin) {
      setPresenceState('connecting')
      return
    }
    setPresenceState('connecting')
    let active = true
    let warningShown = false
    const heartbeat = async () => {
      try {
        const result = await request<{ assigned_to_you: number }>('/admin/presence', {
          method: 'PUT',
          body: '{}',
        })
        if (!active) return
        setPresenceState('active')
        warningShown = false
        if (result.assigned_to_you > 0) {
          notifyAdmin(`${result.assigned_to_you} pending ticket${result.assigned_to_you === 1 ? '' : 's'} assigned to you.`)
        }
      } catch (reason) {
        if (!active || warningShown) return
        setPresenceState('offline')
        warningShown = true
        notifyAdmin(
          reason instanceof Error ? reason.message : 'Admin presence could not be updated.',
          'error',
        )
      }
    }
    void heartbeat()
    const timer = window.setInterval(() => void heartbeat(), 25_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [admin?.username, admin?.role])

  const signOut = async () => {
    const results = await Promise.allSettled([
      request('/admin/presence', { method: 'DELETE' }),
      request('/auth/logout', { method: 'POST', body: '{}' }),
    ])
    if (results.some((result) => result.status === 'rejected')) {
      notifyAdmin('The server could not complete every sign-out action.', 'error')
    }
    accessToken = ''
    setAdmin(null)
  }

  const changeTheme = (value: ThemePreference) => {
    window.localStorage.setItem('safechat-admin-theme', value)
    setTheme(value)
    notifyAdmin(`Theme set to ${value}.`)
  }

  if (!admin) return <Login onLogin={setAdmin} notice={notice} clearNotice={() => setNotice('')} />

  const selected = navItems.find((item) => item.id === section)
  return (
    <div className="app-shell">
      {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <img className="brand-symbol" src="/safechat-mark.svg" alt="" />
          <div className="brand-copy"><strong className="brand-wordmark"><span className="word-safe">Safe</span><span className="word-chat">Chat</span><i>.</i></strong><small>CONTROL CENTER</small></div>
          <button className="icon-btn sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav className="nav-list" aria-label="Admin sections">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="workspace-label">{group.label}</div>
              {group.items.map(({ id, label, icon: Icon }) => (
                <button key={id} className={`nav-item ${section === id ? 'nav-active' : ''}`} aria-current={section === id ? 'page' : undefined} onClick={() => { setSection(id); setSidebarOpen(false) }}>
                  <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-note"><Shield size={16} /><span>{presenceState === 'active' ? 'Ticket routing active' : presenceState === 'connecting' ? 'Connecting to routing' : 'Routing offline'}</span><i className={`presence-${presenceState}`} /></div>
          <button className="profile-button" onClick={() => void signOut()}>
            <div className="avatar avatar-purple">{initials(admin.username)}</div>
            <span className="profile-copy"><strong>{admin.username}</strong><small>{admin.role === 'SUPER_ADMIN' ? 'Superadmin' : 'Administrator'}</small></span>
            <LogOut size={16} className="profile-logout" />
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="breadcrumbs"><span>SafeChat</span><span className="crumb-slash">/</span><strong>{selected?.label}</strong></div>
          <div className="topbar-right">
            <span className="role-pill"><ShieldCheck size={14} />{admin.role === 'SUPER_ADMIN' ? 'SUPERADMIN' : 'ADMIN'}</span>
            <div className="avatar avatar-purple">{initials(admin.username)}</div>
          </div>
        </header>
        <section className="page-content">
          {section === 'overview' && <Dashboard />}
          {section === 'users' && <UsersPage actorRole={admin.role} />}
          {section === 'payments' && <PaymentsPage />}
          {section === 'access' && <AccessPage actorRole={admin.role} />}
          {section === 'support' && <SupportInbox actorRole={admin.role} />}
          {section === 'reports' && <ReportsPage />}
          {section === 'audit' && <AuditPage />}
          {section === 'backup' && <BackupPage />}
          {section === 'settings' && <SettingsPage theme={theme} onThemeChange={changeTheme} />}
        </section>
      </main>
      {toast && <div className={`toast toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}><span className="toast-mark">{toast.tone === 'success' ? <Check size={16} /> : toast.tone === 'error' ? <X size={16} /> : <Activity size={16} />}</span>{toast.message}</div>}
    </div>
  )
}

function Login({ onLogin, notice, clearNotice }: {
  onLogin: (user: { username: string; role: Role }) => void
  notice: string
  clearNotice: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(notice)
  const [busy, setBusy] = useState(false)

  useEffect(() => setError(notice), [notice])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    clearNotice()
    setError('')
    setBusy(true)
    try {
      const data = await request<{
        access_token: string
        user: { username: string; account_role?: string }
      }>('/auth/login', jsonBody({ username, password, device_name: 'SafeChat Admin Portal' }))
      const role = data.user.account_role
      if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
        accessToken = ''
        throw new Error('This account does not have administrator access.')
      }
      accessToken = data.access_token
      onLogin({ username: data.user.username, role })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-screen">
      <div className="login-decoration login-decoration-one" />
      <div className="login-decoration login-decoration-two" />
      <form className="login-card" onSubmit={(event) => void submit(event)}>
        <div className="login-brand"><img className="brand-symbol" src="/safechat-mark.svg" alt="" /><div className="brand-copy"><strong className="brand-wordmark"><span className="word-safe">Safe</span><span className="word-chat">Chat</span><i>.</i></strong><small>ADMINISTRATION</small></div></div>
        <div className="login-icon"><ShieldCheck size={23} /></div>
        <p className="eyebrow">SECURE WORKSPACE</p>
        <h1>Welcome back</h1>
        <p className="login-subtitle">Sign in with an authorized administrator account.</p>
        <label className="field-label" htmlFor="username">Username</label>
        <input id="username" className="text-input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        <label className="field-label" htmlFor="password">Password</label>
        <input id="password" className="text-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        {error && <div className="error-banner" role="alert">{error}</div>}
        <button className="primary-button login-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}<span>{busy ? 'Authenticating…' : 'Sign in securely'}</span></button>
        <div className="login-footer"><Shield size={14} />Role-verified access · encrypted session</div>
      </form>
      <div className="login-caption">SAFECHAT · TRUST & SAFETY OPERATIONS</div>
    </main>
  )
}

function Dashboard() {
  const [data, setData] = useState<Overview | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')
    const controller = new AbortController()
    const [overviewResult, healthResult] = await Promise.allSettled([
      request<Overview>('/admin/overview', { signal: controller.signal }),
      request<Health>('/admin/health', { signal: controller.signal }),
    ])
    let message = ''
    if (overviewResult.status === 'fulfilled') {
      setData(overviewResult.value)
    } else if (!isRefresh) {
      setData(null)
      message = overviewResult.reason instanceof Error
        ? overviewResult.reason.message
        : 'Unable to load admin overview.'
    } else {
      message = overviewResult.reason instanceof Error
        ? overviewResult.reason.message
        : 'Unable to refresh overview.'
    }
    if (healthResult.status === 'fulfilled') {
      setHealth(healthResult.value)
    } else if (!isRefresh) {
      setHealth({ api: 'offline', mongodb: 'unknown', checked_at: new Date().toISOString() })
      if (!message) message = 'Service health could not be checked.'
    }
    setError(message)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    void load(false)
    const timer = window.setInterval(() => void load(true), 45_000)
    return () => window.clearInterval(timer)
  }, [load])

  const u = data?.users
  return (
    <>
      <PageHeading eyebrow="MONITORING" title="Overview" subtitle="Your platform at a glance." action={<button className="secondary-button" onClick={() => void load(true)}><RefreshCw size={15} className={refreshing ? 'refresh-rotate' : ''} />Refresh</button>} />
      {error && <ErrorBanner message={error} />}
      <div className="health-strip">
        <div className="health-title"><span className="health-icon"><Activity size={17} /></span><span><strong>System health</strong><small>Live service checks</small></span></div>
        <HealthChip label="API" value={health?.api || 'checking'} loading={loading && !health} />
        <HealthChip label="MongoDB" value={health?.mongodb || 'checking'} loading={loading && !health} />
        <span className="health-time">{loading && !health ? <span className="skeleton-line skeleton-date" /> : <>Updated {health?.checked_at ? dateLabel(health.checked_at) : '—'}</>}</span>
      </div>
      <div className="metrics-grid">
        <MetricCard label="Total users" value={u?.total} icon={<Users size={18} />} tone="purple" detail={loading ? ' ' : `${u?.active ?? '—'} active accounts`} loading={loading} />
        <MetricCard label="Online now" value={u?.online} icon={<Activity size={18} />} tone="green" detail={loading ? ' ' : 'Live WebSocket presence'} pulse loading={loading} />
        <MetricCard label="Premium members" value={u?.premium} icon={<BadgeCheck size={18} />} tone="orange" detail={loading ? ' ' : `${u?.pro ?? '—'} on Pro plan`} loading={loading} />
        <MetricCard label="Paid transactions · 30d" value={u ? data?.payments.paid_last_30_days : undefined} icon={<CircleDollarSign size={18} />} tone="blue" detail={loading ? ' ' : `${data?.payments.total ?? '—'} total transactions`} loading={loading} />
      </div>
      <div className="dashboard-lower">
        <section className="panel account-panel">
          <div className="panel-heading"><div><p className="eyebrow">ACCOUNT HEALTH</p><h2>Account status</h2></div><Users size={18} className="panel-heading-icon" /></div>
          <div className="status-list">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div className="status-row" key={`status-sk-${index}`} aria-hidden="true">
                  <div className="status-row-top"><span className="skeleton-line skeleton-name" /><span className="skeleton-line skeleton-meta" /></div>
                  <div className="progress-track"><span className="skeleton-line" style={{ width: `${55 - index * 10}%`, height: '100%', borderRadius: 999 }} /></div>
                </div>
              ))
            ) : (
              <>
                <StatusRow label="Active accounts" count={u?.active} total={u?.total} tone="green" />
                <StatusRow label="Deactivated" count={u?.deactivated} total={u?.total} tone="gray" />
                <StatusRow label="Banned" count={u?.banned} total={u?.total} tone="red" />
                <StatusRow label="Pending review" count={u?.pending_review} total={u?.total} tone="orange" />
              </>
            )}
          </div>
        </section>
        <section className="panel attention-panel">
          <div className="panel-heading"><div><p className="eyebrow">NEEDS ATTENTION</p><h2>Operations queue</h2></div><Clock3 size={18} className="panel-heading-icon" /></div>
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div className="queue-row" key={`queue-sk-${index}`} aria-hidden="true">
                <span className="skeleton-avatar" style={{ borderRadius: 10 }} />
                <span style={{ flex: 1 }}><span className="skeleton-line skeleton-name" /><span className="skeleton-line skeleton-meta" style={{ marginTop: 6 }} /></span>
                <span className="skeleton-line skeleton-meta" style={{ width: 28 }} />
              </div>
            ))
          ) : (
            <>
              <div className="queue-row"><span className="queue-icon queue-orange"><LifeBuoy size={17} /></span><span><strong>Open reports</strong><small>Reports awaiting review</small></span><b>{data?.reports_open ?? '—'}</b></div>
              <div className="queue-row"><span className="queue-icon queue-purple"><MessageCircle size={17} /></span><span><strong>Open support tickets</strong><small>Users awaiting a response</small></span><b>{data?.support_tickets_open ?? '—'}</b></div>
              <div className="queue-row"><span className="queue-icon queue-blue"><CircleDollarSign size={17} /></span><span><strong>Paid in last 30 days</strong><small>Successful transactions</small></span><b>{data?.payments.paid_last_30_days ?? '—'}</b></div>
              <div className="queue-row"><span className="queue-icon queue-purple"><ShieldCheck size={17} /></span><span><strong>All admin actions</strong><small>Recorded in the audit log</small></span><span className="audit-live"><i />Audited</span></div>
            </>
          )}
        </section>
      </div>
      <div className="security-callout"><span className="callout-icon"><ShieldCheck size={18} /></span><span><strong>Security by default</strong><small>Every privileged change is audited. Admin role changes require superadmin approval.</small></span><ArrowUpRight size={16} /></div>
    </>
  )
}

function UsersPage({ actorRole }: { actorRole: Role }) {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [plan, setPlan] = useState('')
  const [data, setData] = useState<Page<AdminUser> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const pageSize = 10

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (search) params.set('q', search)
    if (status) params.set('status', status)
    if (plan) params.set('plan', plan)
    request<Page<AdminUser>>(`/admin/users?${params}`, { signal: controller.signal }).then((result) => {
      setData(result); setError('')
    }).catch((reason) => {
      if (controller.signal.aborted) return
      setError(reason instanceof Error ? reason.message : 'Unable to load users.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, pageSize, search, status, plan, reload])

  const doSearch = (event: FormEvent) => { event.preventDefault(); setPage(1); setSearch(query.trim()) }
  const act = async (user: AdminUser, action: 'deactivated' | 'active' | 'banned' | 'premium' | 'pro' | 'revoke-sessions' | 'revoke-admin' | 'request-admin' | 'permanent-delete') => {
    if (action === 'permanent-delete') {
      const typed = window.prompt(
        `PERMANENT DELETE\n\nThis erases @${user.username} and all related data.\nType the username to confirm:`,
      )
      if (!typed || typed.trim().toLowerCase() !== user.username.toLowerCase()) {
        if (typed != null) setError('Username did not match — delete cancelled.')
        return
      }
      const reason = window.prompt(`Reason for permanently deleting @${user.username}:`)
      if (!reason?.trim()) return
      try {
        await request(`/admin/users/${user.id}/permanent`, {
          method: 'DELETE',
          body: JSON.stringify({ reason: reason.trim() }),
        })
        notifyAdmin(`@${user.username} permanently deleted.`)
        setReload((value) => value + 1)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Permanent delete failed.')
      }
      return
    }
    const reason = window.prompt(`Reason for ${action.replace('-', ' ')} for @${user.username}:`)
    if (!reason?.trim()) return
    try {
      if (action === 'request-admin') {
        await request('/admin/role-requests', jsonBody({ user_id: user.id, reason: reason.trim() }))
      } else if (action === 'premium' || action === 'pro') {
        await request(`/admin/users/${user.id}/subscription`, {
          method: 'PATCH',
          body: JSON.stringify({ plan: action, days: 30, reason: reason.trim() }),
        })
      } else if (action === 'revoke-sessions') {
        await request(`/admin/users/${user.id}/revoke-sessions`, jsonBody({ reason: reason.trim() }))
      } else if (action === 'revoke-admin') {
        await request(`/admin/users/${user.id}/revoke-admin`, jsonBody({ reason: reason.trim() }))
      } else {
        const params = new URLSearchParams({ status: action })
        await request(`/admin/users/${user.id}/status?${params}`, {
          method: 'PATCH',
          body: JSON.stringify({ reason: reason.trim() }),
        })
      }
      notifyAdmin(`@${user.username}: ${action.replaceAll('-', ' ')} completed.`)
      setReload((value) => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The requested change failed.')
    }
  }
  const pages = Math.max(1, Math.ceil((data?.total || 0) / pageSize))
  return (
    <>
      <PageHeading eyebrow="PEOPLE & ACCESS" title="Users" subtitle="Search accounts, manage subscriptions and protect the community." />
      <div className="toolbar">
        <form className="search-form" onSubmit={doSearch}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, username, email or phone" /><button type="submit">Search</button></form>
        <select className="select-input" aria-label="Filter by account status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All statuses</option><option value="active">Active</option><option value="deactivated">Deactivated</option><option value="banned">Banned</option><option value="pending_review">Pending review</option><option value="deleted">Deleted</option></select>
        <select className="select-input" aria-label="Filter by plan" value={plan} onChange={(event) => { setPlan(event.target.value); setPage(1) }}><option value="">All plans</option><option value="premium">Premium</option><option value="pro">Pro</option></select>
      </div>
      {error && <ErrorBanner message={error} />}
      <section className="panel table-panel table-panel-fill">
        <div className="table-caption"><span><strong>{loading && !data ? '—' : (data?.total ?? '—')}</strong> accounts</span><span className="table-caption-right"><span className="live-dot" />Live status</span></div>
        <div className="table-scroll"><table><thead><tr><th>USER</th><th>ACCOUNT</th><th>PLAN</th><th>LAST SEEN</th><th className="actions-heading">ACTIONS</th></tr></thead>
          <tbody>
            {loading ? (
              <TableSkeletonRows columns={5} rows={8} />
            ) : data?.items.length ? data.items.map((row) => (
            <tr key={row.id}>
              <td><div className="user-cell"><div className={`avatar ${row.online ? 'avatar-online' : 'avatar-muted'}`}>{initials(row.display_name || row.username)}</div><span className="user-cell-copy"><strong>{row.display_name || row.username}{row.verified_badge && <BadgeCheck size={14} className="verified-icon" />}</strong><small>@{row.username}{row.email ? ` · ${row.email}` : ''}</small></span></div></td>
              <td><span className={`status-pill status-${row.account_status}`}>{row.account_status.replace('_', ' ')}</span><small className="sub-cell">{row.account_role === 'USER' ? 'Member' : row.account_role.replace('_', ' ')}</small></td>
              <td><span className={`plan-pill ${row.subscription_plan === 'premium' ? 'plan-premium' : ''}`}>{row.subscription_plan === 'premium' ? <BadgeCheck size={13} /> : null}{row.subscription_plan}</span>{row.premium_expires_at && row.subscription_plan === 'premium' && <small className="sub-cell">Until {new Date(row.premium_expires_at).toLocaleDateString()}</small>}</td>
              <td><span className="date-cell">{row.online ? <span className="online-label"><i />Online now</span> : dateLabel(row.last_seen)}</span></td>
              <td><UserActions row={row} actorRole={actorRole} onAction={(action) => void act(row, action)} /></td>
            </tr>
          )) : <TableMessage columns={5} text="No matching accounts." />}
          </tbody>
        </table></div>
        <Pagination page={page} pages={pages} total={data?.total || 0} pageSize={pageSize} onPage={setPage} />
      </section>
    </>
  )
}

function UserActions({ row, actorRole, onAction }: {
  row: AdminUser
  actorRole: Role
  onAction: (action: 'deactivated' | 'active' | 'banned' | 'premium' | 'pro' | 'revoke-sessions' | 'revoke-admin' | 'request-admin' | 'permanent-delete') => void
}) {
  const [open, setOpen] = useState(false)
  const canManage = actorRole === 'SUPER_ADMIN' ? row.account_role !== 'SUPER_ADMIN' : !['ADMIN', 'SUPER_ADMIN'].includes(row.account_role)
  return (
    <div className="action-menu-wrap">
      <button className="icon-btn row-menu-btn" aria-label={`Actions for ${row.username}`} onClick={() => setOpen((value) => !value)}><MoreHorizontal size={19} /></button>
      {open && (
        <div className="action-sheet" role="dialog" aria-modal="true" aria-label={`Actions for ${row.username}`}>
          <button className="menu-dismiss" onClick={() => setOpen(false)} aria-label="Close actions" />
          <div className="action-menu">
            <div className="action-menu-header">
              <strong>@{row.username}</strong>
              <button type="button" className="icon-btn action-menu-close" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <button type="button" onClick={() => { onAction(row.subscription_plan === 'premium' ? 'pro' : 'premium'); setOpen(false) }}><BadgeCheck size={15} />{row.subscription_plan === 'premium' ? 'Revoke Premium' : 'Grant Premium'}</button>
            {canManage && <button type="button" onClick={() => { onAction('revoke-sessions'); setOpen(false) }}><LogOut size={15} />Revoke all sessions</button>}
            {actorRole === 'SUPER_ADMIN' && row.account_role === 'ADMIN' && <button type="button" className="danger-menu-item" onClick={() => { onAction('revoke-admin'); setOpen(false) }}><Shield size={15} />Revoke admin role</button>}
            {canManage && row.account_status !== 'banned' && <button type="button" onClick={() => { onAction(row.account_status === 'deactivated' ? 'active' : 'deactivated'); setOpen(false) }}><Ban size={15} />{row.account_status === 'deactivated' ? 'Reactivate account' : 'Deactivate account'}</button>}
            {canManage && row.account_status !== 'banned' && <button type="button" className="danger-menu-item" onClick={() => { onAction('banned'); setOpen(false) }}><Ban size={15} />Ban account</button>}
            {actorRole === 'ADMIN' && row.account_role === 'USER' && <button type="button" onClick={() => { onAction('request-admin'); setOpen(false) }}><ShieldCheck size={15} />Request admin access</button>}
            {actorRole === 'SUPER_ADMIN' && canManage && <button type="button" className="danger-menu-item" onClick={() => { onAction('permanent-delete'); setOpen(false) }}><Trash2 size={15} />Delete permanently</button>}
          </div>
        </div>
      )}
    </div>
  )
}

function PaymentsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [data, setData] = useState<Page<AdminPayment> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), page_size: '15' })
    if (status) params.set('status', status)
    request<Page<AdminPayment>>(`/admin/payments?${params}`, { signal: controller.signal }).then((result) => {
      setData(result); setError('')
    }).catch((reason) => {
      if (controller.signal.aborted) return
      setError(reason instanceof Error ? reason.message : 'Unable to load payments.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, status])
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 15))
  return (
    <>
      <PageHeading eyebrow="REVENUE OPERATIONS" title="Payments" subtitle="Review payment status and premium plan transactions." />
      <div className="toolbar"><div className="toolbar-note"><CreditCard size={16} /> Provider transaction records are read-only here.</div><select className="select-input" value={status} aria-label="Filter payments by status" onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All statuses</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select></div>
      {error && <ErrorBanner message={error} />}
      <section className="panel table-panel table-panel-fill"><div className="table-caption"><span><strong>{loading && !data ? '—' : (data?.total ?? '—')}</strong> transactions</span><span className="table-caption-right">Payments are never marked paid manually</span></div>
        <div className="table-scroll"><table><thead><tr><th>ACCOUNT</th><th>PLAN</th><th>AMOUNT</th><th>STATUS</th><th>CREATED</th><th>PAID</th></tr></thead><tbody>
          {loading ? <TableSkeletonRows columns={6} rows={8} /> : data?.items.length ? data.items.map((row) => <tr key={row.id}>
            <td><div className="user-cell"><div className="avatar avatar-muted">{initials(row.display_name || row.username)}</div><span className="user-cell-copy"><strong>{row.display_name || row.username || 'Unknown account'}</strong><small>@{row.username || 'unknown'}</small></span></div></td>
            <td><span className="plan-pill">{row.plan || '—'}</span><small className="sub-cell">{row.provider || '—'}</small></td>
            <td><strong className="amount-cell">{money(row.amount, row.currency)}</strong></td>
            <td><span className={`status-pill status-${row.status || 'pending'}`}>{row.status || 'unknown'}</span></td>
            <td className="date-cell">{dateLabel(row.created_at)}</td><td className="date-cell">{dateLabel(row.paid_at)}</td>
          </tr>) : <TableMessage columns={6} text="No transactions found." />}
        </tbody></table></div><Pagination page={page} pages={pages} total={data?.total || 0} pageSize={15} onPage={setPage} />
      </section>
    </>
  )
}

function AccessPage({ actorRole }: { actorRole: Role }) {
  const [items, setItems] = useState<RoleRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    request<RoleRequest[]>('/admin/role-requests?status=pending', { signal: controller.signal }).then((result) => {
      setItems(result); setError('')
    }).catch((reason) => {
      if (controller.signal.aborted) return
      setError(reason instanceof Error ? reason.message : 'Unable to load access requests.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])

  const decide = async (item: RoleRequest, decision: 'approve' | 'reject') => {
    const reason = window.prompt(`${decision === 'approve' ? 'Approval' : 'Rejection'} note for @${item.target_username || 'user'}:`)
    if (!reason?.trim()) return
    try {
      await request(`/admin/role-requests/${item.id}/${decision}`, jsonBody({ reason: reason.trim() }))
      notifyAdmin(`Admin request ${decision === 'approve' ? 'approved' : 'rejected'}.`)
      setReload((value) => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to process this request.')
    }
  }
  return (
    <>
      <PageHeading eyebrow="IDENTITY & GOVERNANCE" title="Access control" subtitle="Admin access is granted only after superadmin review." />
      <div className="access-policy"><div className="policy-icon"><ShieldCheck size={20} /></div><div><strong>Two-person control for administrator access</strong><p>Administrators can nominate a user; only a superadmin can approve or reject the request. Every decision is recorded.</p></div><span className="policy-tag"><ShieldCheck size={14} />ENFORCED</span></div>
      {error && <ErrorBanner message={error} />}
      <section className="panel table-panel table-panel-fill"><div className="panel-table-heading"><div><p className="eyebrow">PENDING REVIEW</p><h2>Administrator requests</h2></div><span className="count-chip">{loading ? '—' : items.length} pending</span></div>
        {loading && !items.length ? (
          <div className="request-list request-list-skeleton" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <article className="request-card skeleton-request-card" key={`req-sk-${index}`}>
                <div className="request-user"><div className="skeleton-avatar" /><span><span className="skeleton-line skeleton-name" /><span className="skeleton-line skeleton-meta" /></span></div>
                <div className="request-reason"><span className="skeleton-line skeleton-meta" /><span className="skeleton-line skeleton-name" style={{ width: '90%', marginTop: 8 }} /></div>
                <div className="request-actions"><span className="skeleton-line skeleton-pill" /><span className="skeleton-line skeleton-pill" /></div>
              </article>
            ))}
          </div>
        ) : items.length ? <div className="request-list">{items.map((item) => <article className="request-card" key={item.id}>
          <div className="request-user"><div className="avatar avatar-purple">{initials(item.target_username)}</div><span><strong>@{item.target_username || 'unknown'}</strong><small>Nominated by @{item.requester_username || 'administrator'} · {dateLabel(item.created_at)}</small></span></div>
          <div className="request-reason"><small>REQUEST REASON</small><p>{item.reason}</p></div>
          {actorRole === 'SUPER_ADMIN' ? <div className="request-actions"><button className="secondary-button" onClick={() => void decide(item, 'reject')}>Reject</button><button className="primary-button" onClick={() => void decide(item, 'approve')}><ShieldCheck size={15} />Approve admin</button></div> : <span className="status-pill status-pending">Awaiting superadmin</span>}
        </article>)}</div> : <EmptyState icon={<ShieldCheck size={20} />} title="No pending requests" text="New administrator nominations will appear here for review." />}
      </section>
      {actorRole !== 'SUPER_ADMIN' && <div className="note-block"><Shield size={16} />You can submit a nomination from the user directory. Role assignments cannot be made directly.</div>}
    </>
  )
}

function SupportInbox({ actorRole }: { actorRole: Role }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [data, setData] = useState<Page<SupportInboxTicket> | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const pageSize = 25

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (status) params.set('status', status)
      const result = await request<Page<SupportInboxTicket>>(`/admin/support/tickets?${params}`, signal ? { signal } : {})
      if (signal?.aborted) return
      setData(result)
      setSelectedId((current) =>
        current && result.items.some((ticket) => ticket.id === current)
          ? current
          : result.items[0]?.id || null,
      )
      setError('')
    } catch (reason) {
      if (signal?.aborted) return
      setError(reason instanceof Error ? reason.message : 'Unable to load support tickets.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [page, status])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    const timer = window.setInterval(() => void load(), 30_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [load])

  const selected = data?.items.find((ticket) => ticket.id === selectedId) || null
  const sendReply = async () => {
    if (!selected || !reply.trim() || sending) return
    setSending(true)
    setError('')
    try {
      const updated = await request<SupportInboxTicket>(
        `/admin/support/tickets/${selected.id}/replies`,
        jsonBody({ body: reply.trim() }),
      )
      setData((current) => current && ({
        ...current,
        items: current.items.map((ticket) => ticket.id === updated.id
          ? { ...ticket, ...updated }
          : ticket),
      }))
      setReply('')
      notifyAdmin('Your support reply was sent.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to send the support reply.')
    } finally {
      setSending(false)
    }
  }

  const toggleClosed = async () => {
    if (!selected) return
    const nextStatus = selected.status === 'closed' ? 'in_progress' : 'closed'
    setSending(true)
    setError('')
    try {
      await request(`/admin/support/tickets/${selected.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          reason: nextStatus === 'closed' ? 'Closed by support administrator' : 'Reopened by support administrator',
        }),
      })
      notifyAdmin(nextStatus === 'closed' ? 'Ticket closed.' : 'Ticket reopened.')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update ticket status.')
    } finally {
      setSending(false)
    }
  }

  const pages = Math.max(1, Math.ceil((data?.total || 0) / pageSize))
  const statusTone = (value?: string) => {
    if (value === 'closed') return 'closed'
    if (value === 'pending') return 'pending'
    if (value === 'in_progress') return 'progress'
    return 'default'
  }
  return (
    <div className="tickets-page">
      <PageHeading
        eyebrow="CUSTOMER CARE"
        title="Support tickets"
        subtitle={actorRole === 'SUPER_ADMIN'
          ? 'Review every ticket, its owner, and assignment history.'
          : 'Your assigned tickets. Replies sync to the user’s Support screen.'}
        action={<button className="secondary-button" onClick={() => void load()}><RefreshCw size={14} className={loading ? 'refresh-rotate' : ''} />Refresh</button>}
      />
      {error && <ErrorBanner message={error} />}

      <div className="tickets-toolbar">
        <div className="tickets-toolbar-left">
          <span className="tickets-count-chip"><MessageCircle size={14} /><strong>{data?.total ?? '—'}</strong> tickets</span>
        </div>
        <div className="tickets-toolbar-right">
          <label className="tickets-filter-label">
            <span>Status</span>
            <select
              className="select-input"
              value={status}
              aria-label="Filter support tickets"
              onChange={(event) => { setStatus(event.target.value); setPage(1) }}
            >
              <option value="">All tickets</option>
              {actorRole === 'SUPER_ADMIN' && <option value="pending">Pending</option>}
              <option value="in_progress">In progress</option>
              <option value="closed">Closed</option>
            </select>
          </label>
        </div>
      </div>

      <div className={`tickets-layout ${selected ? 'has-detail' : ''}`}>
        <section className="panel table-panel tickets-table-panel">
          <div className="table-scroll">
            <table className="tickets-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>User</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Assignee</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <TableSkeletonRows columns={6} rows={8} />
                ) : !data?.items.length ? (
                  <TableMessage columns={6} text="No tickets match this filter." />
                ) : (
                  data.items.map((ticket, index) => (
                    <tr
                      key={ticket.id}
                      className={selected?.id === ticket.id ? 'is-selected' : ''}
                      onClick={() => setSelectedId(ticket.id)}
                    >
                      <td>
                        <span className="ticket-id">#{String((page - 1) * pageSize + index + 1).padStart(2, '0')}</span>
                      </td>
                      <td>
                        <div className="ticket-user-cell">
                          <span className="avatar avatar-muted">{(ticket.display_name || ticket.username || '?').slice(0, 1).toUpperCase()}</span>
                          <span>
                            <strong>{ticket.display_name || ticket.username || 'User'}</strong>
                            <small>@{ticket.username || 'unknown'}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="ticket-subject-cell">
                          <strong>{ticket.subject || 'No subject'}</strong>
                          <small>{(ticket.body || '').slice(0, 72)}{(ticket.body || '').length > 72 ? '…' : ''}</small>
                        </div>
                      </td>
                      <td>
                        <span className={`ticket-status-pill tone-${statusTone(ticket.status)}`}>
                          {(ticket.status || 'open').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="muted">{ticket.assigned_admin_username || '—'}</td>
                      <td className="muted">{dateLabel(ticket.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={pages} total={data?.total || 0} pageSize={pageSize} onPage={setPage} />
        </section>

        <aside className="panel tickets-detail">
          {!selected ? (
            <EmptyState icon={<MessageCircle size={22} />} title="Select a ticket" text="Choose a row to read the thread and reply." />
          ) : (
            <>
              <div className="tickets-detail-head">
                <div>
                  <p className="eyebrow">TICKET</p>
                  <h2>{selected.subject || 'Support request'}</h2>
                  <p className="muted">
                    {(selected.display_name || selected.username || 'User')}
                    {selected.username ? ` · @${selected.username}` : ''}
                  </p>
                </div>
                <span className={`ticket-status-pill tone-${statusTone(selected.status)}`}>
                  {(selected.status || 'open').replace('_', ' ')}
                </span>
              </div>
              <div className="tickets-detail-actions">
                <button type="button" className="secondary-button" disabled={sending} onClick={() => void toggleClosed()}>
                  {selected.status === 'closed' ? 'Reopen' : 'Close ticket'}
                </button>
              </div>
              <div className="tickets-thread">
                <div className="tickets-bubble is-user">
                  <header><strong>{selected.display_name || selected.username || 'User'}</strong><span>{dateLabel(selected.created_at)}</span></header>
                  <p>{selected.body}</p>
                </div>
                {(selected as any).replies?.length
                  ? (selected as any).replies.map((item: any, i: number) => (
                      <div key={item.id || i} className={`tickets-bubble ${item.from_admin || item.admin_id ? 'is-admin' : 'is-user'}`}>
                        <header>
                          <strong>{item.admin_username || item.username || (item.from_admin ? 'Support' : 'User')}</strong>
                          <span>{dateLabel(item.created_at)}</span>
                        </header>
                        <p>{item.body}</p>
                      </div>
                    ))
                  : null}
              </div>
              {selected.status !== 'closed' && (
                <div className="tickets-reply">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Write a reply…"
                    rows={3}
                  />
                  <button type="button" className="primary-button" disabled={sending || !reply.trim()} onClick={() => void sendReply()}>
                    {sending ? 'Sending…' : 'Send reply'}
                  </button>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

function ReportsPage() {
  const [data, setData] = useState<Page<AdminReport> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    const params = new URLSearchParams({ page: '1', page_size: '50' })
    if (status) params.set('status', status)
    request<Page<AdminReport>>(`/admin/reports?${params}`, { signal: controller.signal }).then((result) => {
      setData(result); setError('')
    }).catch((reason) => {
      if (controller.signal.aborted) return
      setError(reason instanceof Error ? reason.message : 'Unable to load reports.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [status, reload])
  const resolve = async (row: AdminReport, nextStatus: 'resolved' | 'dismissed' | 'under_review') => {
    const reason = window.prompt(`Reason for marking this report ${nextStatus.replace('_', ' ')}:`)
    if (!reason?.trim()) return
    try {
      await request(`/admin/reports/${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus, reason: reason.trim() }) })
      notifyAdmin(`Report marked ${nextStatus.replace('_', ' ')}.`)
      setReload((value) => value + 1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update report.') }
  }
  return (
    <>
      <PageHeading eyebrow="TRUST & SAFETY" title="Reports" subtitle="Triage and record the disposition of community reports." />
      <div className="toolbar"><div className="toolbar-note"><LifeBuoy size={16} />Sensitive message contents are not exposed in this view.</div><select className="select-input" value={status} aria-label="Filter reports" onChange={(event) => setStatus(event.target.value)}><option value="">All reports</option><option value="open">Open</option><option value="pending">Pending</option><option value="under_review">Under review</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></div>
      {error && <ErrorBanner message={error} />}
      <section className="panel table-panel table-panel-fill"><div className="table-caption"><span><strong>{loading && !data ? '—' : (data?.total ?? '—')}</strong> reports</span></div>
        <div className="table-scroll"><table><thead><tr><th>REPORT</th><th>REASON</th><th>STATUS</th><th>SUBMITTED</th><th>ACTION</th></tr></thead><tbody>
          {loading ? <TableSkeletonRows columns={5} rows={8} /> : data?.items.length ? data.items.map((row) => <tr key={row.id}>
            <td><span className="report-target">{row.target_type || 'account'}</span><small className="sub-cell">Target {row.target_id ? `#${row.target_id.slice(-7)}` : '—'} · Reporter {row.reporter_id ? `#${row.reporter_id.slice(-7)}` : '—'}</small></td>
            <td className="report-reason">{row.reason || 'No reason provided'}</td><td><span className={`status-pill status-${row.status || 'open'}`}>{row.status || 'open'}</span></td><td className="date-cell">{dateLabel(row.created_at)}</td>
            <td>{['resolved', 'dismissed'].includes(row.status || '') ? <span className="muted-text">Closed</span> : <div className="inline-actions"><button onClick={() => void resolve(row, 'under_review')}>Review</button><button className="resolve-btn" onClick={() => void resolve(row, 'resolved')}>Resolve</button><button className="dismiss-btn" onClick={() => void resolve(row, 'dismissed')}>Dismiss</button></div>}</td>
          </tr>) : <TableMessage columns={5} text="No reports found." />}
        </tbody></table></div>
      </section>
    </>
  )
}

function AuditPage() {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Page<AuditEntry> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    request<Page<AuditEntry>>(`/admin/audit?page=${page}&page_size=20`, { signal: controller.signal }).then((result) => {
      setData(result); setError('')
    }).catch((reason) => {
      if (controller.signal.aborted) return
      setError(reason instanceof Error ? reason.message : 'Unable to load audit events.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page])
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 20))
  return (
    <>
      <PageHeading eyebrow="ACCOUNTABILITY" title="Audit log" subtitle="A chronological record of privileged changes." />
      {error && <ErrorBanner message={error} />}
      <section className="panel table-panel table-panel-fill"><div className="table-caption"><span><strong>{loading && !data ? '—' : (data?.total ?? '—')}</strong> recorded actions</span><span className="table-caption-right"><ShieldCheck size={14} />Append-only event history</span></div>
        <div className="table-scroll"><table><thead><tr><th>EVENT</th><th>ACTOR</th><th>RESOURCE</th><th>DETAILS</th><th>WHEN</th></tr></thead><tbody>
          {loading ? <TableSkeletonRows columns={5} rows={10} /> : data?.items.length ? data.items.map((row) => <tr key={row.id}>
            <td><span className="audit-action"><Activity size={14} />{(row.action || 'action').replaceAll('_', ' ')}</span></td>
            <td><span className="actor-label">{row.actor_username ? `@${row.actor_username}` : row.actor_role || 'ADMIN'}</span><small className="sub-cell">{row.actor_role || 'ADMIN'}{row.actor_id ? ` · #${row.actor_id.slice(-7)}` : ''}</small></td>
            <td><span>{row.resource_type || '—'}</span><small className="sub-cell">{row.resource_id ? `#${row.resource_id.slice(-7)}` : '—'}</small></td>
            <td><span className="audit-detail">{row.metadata?.reason ? String(row.metadata.reason) : row.metadata?.status ? `Status: ${String(row.metadata.status)}` : row.metadata?.plan ? `Plan: ${String(row.metadata.plan)}` : '—'}</span></td>
            <td className="date-cell">{dateLabel(row.timestamp)}</td>
          </tr>) : <TableMessage columns={5} text="No administrative events recorded yet." />}
        </tbody></table></div><Pagination page={page} pages={pages} total={data?.total || 0} pageSize={20} onPage={setPage} />
      </section>
    </>
  )
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</div>
}

function MetricCard({ label, value, icon, tone, detail, loading, pulse }: {
  label: string; value?: number; icon: ReactNode; tone: string; detail: string; loading: boolean; pulse?: boolean
}) {
  return <article className="metric-card"><div className="metric-top"><span className={`metric-icon metric-${tone}`}>{icon}</span><span className="metric-trend"><ArrowUpRight size={14} />LIVE</span></div><p>{label}</p><strong className="metric-value">{loading ? <span className="skeleton-line" /> : <>{pulse && <span className="metric-pulse" />}{value?.toLocaleString() ?? '—'}</>}</strong><small>{detail}</small></article>
}

function HealthChip({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return <div className="health-chip"><span className={`health-dot ${!loading && value === 'online' ? 'dot-online' : !loading ? 'dot-offline' : ''}`} /><span className="health-label">{label}</span><strong className={loading ? 'checking' : value === 'online' ? 'health-online' : 'health-offline'}>{loading ? 'Checking' : value}</strong></div>
}

function StatusRow({ label, count, total, tone }: { label: string; count?: number; total?: number; tone: string }) {
  const percent = total ? Math.min(100, Math.round(((count || 0) / total) * 100)) : 0
  return <div className="status-row"><div className="status-row-top"><span><i className={`status-bullet bullet-${tone}`} />{label}</span><strong>{count?.toLocaleString() ?? '—'} <small>{total ? `${percent}%` : ''}</small></strong></div><div className="progress-track"><span className={`progress-${tone}`} style={{ width: `${percent}%` }} /></div></div>
}

function Pagination({ page, pages, total, pageSize, onPage }: { page: number; pages: number; total: number; pageSize: number; onPage: (value: number) => void }) {
  const first = total ? (page - 1) * pageSize + 1 : 0
  const last = Math.min(page * pageSize, total)
  return <div className="pagination"><span>Showing <strong>{first}–{last}</strong> of <strong>{total}</strong></span><div><button className="pagination-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={17} /></button><span>Page {page} of {pages}</span><button className="pagination-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={17} /></button></div></div>
}

function TableMessage({ columns, text }: { columns: number; text: string }) {
  return <tr><td colSpan={columns} className="table-message">{text}</td></tr>
}

function TableSkeletonRows({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <tr key={`sk-${index}`} className="skeleton-row" aria-hidden="true">
          {Array.from({ length: columns }).map((__, col) => (
            <td key={`sk-${index}-${col}`}>
              {col === 0 ? (
                <div className="user-cell">
                  <div className="skeleton-avatar" />
                  <span className="user-cell-copy">
                    <span className="skeleton-line skeleton-name" />
                    <span className="skeleton-line skeleton-meta" />
                  </span>
                </div>
              ) : col === columns - 1 ? (
                <span className="skeleton-line skeleton-action" />
              ) : (
                <span className={`skeleton-line ${col === 1 ? 'skeleton-pill' : col === 2 ? 'skeleton-date' : 'skeleton-meta'}`} />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><strong>{title}</strong><p>{text}</p></div>
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="error-banner page-error" role="alert"><X size={15} />{message}</div>
}

function SettingsPage({
  theme,
  onThemeChange,
}: {
  theme: ThemePreference
  onThemeChange: (value: ThemePreference) => void
}) {
  const [username, setUsername] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resetResult, setResetResult] = useState<{
    username: string
    temporary_password: string
    revoked_sessions: number
  } | null>(null)

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!window.confirm(`Reset the password for @${username.trim()} and sign out its existing sessions?`)) return
    setBusy(true)
    setError('')
    setResetResult(null)
    try {
      const result = await request<{
        username: string
        temporary_password: string
        revoked_sessions: number
      }>('/admin/users/reset-password', jsonBody({
        username: username.trim(),
        reason: reason.trim(),
      }))
      setResetResult(result)
      setReason('')
      notifyAdmin(`Password reset for @${result.username}.`)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Unable to reset the user password.'
      setError(message)
      notifyAdmin(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const copyTemporaryPassword = async () => {
    if (!resetResult) return
    try {
      await navigator.clipboard.writeText(resetResult.temporary_password)
      notifyAdmin('Temporary password copied.')
    } catch {
      notifyAdmin('Clipboard access is unavailable; copy the password manually.', 'error')
    }
  }

  return (
    <>
      <PageHeading eyebrow="ADMIN PREFERENCES" title="Settings" subtitle="Personalize this portal and manage account recovery actions." />
      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="panel-heading"><div><p className="eyebrow">APPEARANCE</p><h2>Theme</h2></div><Sun size={18} className="panel-heading-icon" /></div>
          <p className="settings-copy">Choose how the admin workspace appears on this device.</p>
          <div className="theme-choices" role="group" aria-label="Admin portal theme">
            {([
              ['system', 'System', Monitor],
              ['light', 'Light', Sun],
              ['dark', 'Dark', Moon],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                className={`theme-choice ${theme === value ? 'theme-choice-active' : ''}`}
                aria-pressed={theme === value}
                onClick={() => onThemeChange(value)}
              >
                <Icon size={18} /><span>{label}</span>{theme === value && <Check size={15} />}
              </button>
            ))}
          </div>
          <div className="settings-note"><Monitor size={15} />Theme preference is saved only in this browser.</div>
        </section>

        <section className="panel settings-panel">
          <div className="panel-heading"><div><p className="eyebrow">ACCOUNT RECOVERY</p><h2>Reset a user password</h2></div><KeyRound size={18} className="panel-heading-icon" /></div>
          <p className="settings-copy">Issue a one-time temporary password for an account below your role. Higher-level accounts require superadmin control.</p>
          {error && <ErrorBanner message={error} />}
          <form className="reset-password-form" onSubmit={(event) => void resetPassword(event)}>
            <label className="field-label" htmlFor="reset-username">Username</label>
            <input id="reset-username" className="text-input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" maxLength={32} required />
            <label className="field-label" htmlFor="reset-reason">Reason for reset</label>
            <textarea id="reset-reason" className="settings-textarea" value={reason} onChange={(event) => setReason(event.target.value.slice(0, 500))} rows={3} minLength={3} maxLength={500} required />
            <button className="primary-button" disabled={busy || !username.trim() || reason.trim().length < 3}>{busy ? <LoaderCircle className="spin" size={15} /> : <KeyRound size={15} />}{busy ? 'Resetting password…' : 'Generate temporary password'}</button>
          </form>
          {resetResult && <div className="temporary-password-result" role="status">
            <div><strong>Temporary password generated</strong><small>@{resetResult.username} · {resetResult.revoked_sessions} sessions revoked</small></div>
            <div className="temporary-password-copy"><code>{resetResult.temporary_password}</code><button className="secondary-button" type="button" onClick={() => void copyTemporaryPassword()}><Copy size={14} />Copy</button></div>
            <p>Copy it now and share it only through a trusted channel. This value is not saved in the audit log; ask the user to replace it after signing in.</p>
          </div>}
        </section>
      </div>
    </>
  )
}

type BackupScope = {
  id: string
  label: string
  collections: string[]
}
type BackupJob = {
  id: string
  status: string
  scope: string
  until?: string | null
  filename?: string
  progress?: number
  phase?: string
  message?: string
  document_count?: number
  collections_done?: string[]
  error?: string | null
  started_at?: string
  finished_at?: string | null
  size_bytes?: number | null
  triggered_by?: string
}
type BackupFile = {
  filename: string
  size_bytes: number
  created_at: string
  scope?: string
  until?: string | null
  document_count?: number
  collections?: Record<string, number>
}


const BACKUP_SCOPE_ICONS: Record<string, typeof Database> = {
  full: Database,
  messages: MessageCircle,
  conversations: Layers,
  users: Users,
  contacts: Contact,
  support: LifeBuoy,
  payments: CreditCard,
  status: Activity,
  groups: Users,
  audit: FileClock,
  notes: Archive,
}

function formatBytes(n?: number | null) {
  if (n == null || Number.isNaN(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function BackupPage() {
  const [scopes, setScopes] = useState<BackupScope[]>([])
  const [files, setFiles] = useState<BackupFile[]>([])
  const [jobs, setJobs] = useState<BackupJob[]>([])
  const [scope, setScope] = useState('full')
  const [untilLocal, setUntilLocal] = useState(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [activeJob, setActiveJob] = useState<BackupJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const data = await request<{ files: BackupFile[]; jobs: BackupJob[] }>('/admin/backups')
      setFiles(data.files || [])
      setJobs(data.jobs || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load backups')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const data = await request<{ scopes: BackupScope[] }>('/admin/backups/scopes')
        setScopes(data.scopes || [])
      } catch {
        /* scopes endpoint optional fallback */
        setScopes([
          { id: 'full', label: 'Full', collections: ['*'] },
          { id: 'messages', label: 'Messages', collections: ['messages'] },
          { id: 'conversations', label: 'Conversations', collections: ['conversations', 'messages'] },
          { id: 'users', label: 'Users', collections: ['users'] },
        ])
      }
      await refresh()
    })()
  }, [refresh])

  useEffect(() => {
    if (!activeJobId) return
    let cancelled = false
    const tick = async () => {
      try {
        const job = await request<BackupJob>(`/admin/backups/jobs/${activeJobId}`)
        if (cancelled) return
        setActiveJob(job)
        if (job.status === 'completed' || job.status === 'failed') {
          setActiveJobId(null)
          setStarting(false)
          await refresh()
          notifyAdmin(
            job.status === 'completed' ? 'Backup completed' : `Backup failed: ${job.error || job.message}`,
            job.status === 'completed' ? 'success' : 'error',
          )
          return
        }
      } catch {
        /* keep polling */
      }
      if (!cancelled) window.setTimeout(tick, 1200)
    }
    void tick()
    return () => {
      cancelled = true
    }
  }, [activeJobId, refresh])

  const start = async () => {
    setStarting(true)
    setError('')
    try {
      // datetime-local → ISO (treat as local, send with offset)
      const local = new Date(untilLocal)
      const until = Number.isNaN(local.getTime()) ? undefined : local.toISOString()
      const job = await request<BackupJob>('/admin/backups', {
        method: 'POST',
        body: JSON.stringify({ scope, until }),
      })
      setActiveJob(job)
      setActiveJobId(job.id)
      notifyAdmin('Backup started — users can keep messaging', 'info')
      await refresh()
    } catch (e) {
      setStarting(false)
      setError(e instanceof Error ? e.message : 'Could not start backup')
      notifyAdmin('Could not start backup', 'error')
    }
  }

  const download = async (filename: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/admin/backups/download/${encodeURIComponent(filename)}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      notifyAdmin('Download started', 'success')
    } catch {
      notifyAdmin('Download failed', 'error')
    }
  }

  const remove = async (filename: string) => {
    if (!window.confirm(`Delete backup ${filename}?`)) return
    try {
      await request(`/admin/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' })
      notifyAdmin('Backup deleted', 'success')
      await refresh()
    } catch {
      notifyAdmin('Could not delete backup', 'error')
    }
  }

  const running = activeJob && (activeJob.status === 'running' || activeJob.status === 'queued')

  return (
    <div className="backup-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">DATA PROTECTION</p>
          <h1>Database backup</h1>
          <p className="page-sub">
            Snapshot collections into a single compressed file. Choose a cutoff time so live traffic can continue while the archive only includes data up to that moment.
          </p>
        </div>
      </header>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="backup-grid">
        <section className="panel backup-composer">
          <div className="panel-table-heading">
            <div>
              <p className="eyebrow">NEW SNAPSHOT</p>
              <h2>Create backup</h2>
            </div>
            <Database size={18} className="text-muted" />
          </div>

          <p className="backup-hint">Select what to include and the point-in-time cutoff.</p>

          <div className="backup-scope-grid">
            {(scopes.length ? scopes : [{ id: 'full', label: 'Full', collections: ['*'] }]).map((s) => {
              const Icon = BACKUP_SCOPE_ICONS[s.id] || FolderArchive
              return (
              <button
                key={s.id}
                type="button"
                className={`backup-scope-card ${scope === s.id ? 'is-active' : ''}`}
                onClick={() => setScope(s.id)}
              >
                <span className="backup-scope-icon"><Icon size={18} strokeWidth={2.2} /></span>
                <strong>{s.label || s.id}</strong>
                <span>{(s.collections || []).join(', ')}</span>
              </button>
              )
            })}
          </div>

          <label className="field-label" htmlFor="backup-until">
            Include data up to
          </label>
          <input
            id="backup-until"
            type="datetime-local"
            className="field-input"
            value={untilLocal}
            onChange={(e) => setUntilLocal(e.target.value)}
          />
          <p className="backup-hint subtle">
            Documents newer than this timestamp are skipped. The database stays writable for users.
          </p>

          <button
            type="button"
            className="primary-btn backup-start-btn"
            disabled={starting || !!running}
            onClick={() => void start()}
          >
            {starting || running ? (
              <>
                <LoaderCircle size={16} className="spin" /> Working…
              </>
            ) : (
              <>
                <Play size={16} /> Start backup
              </>
            )}
          </button>

          {(activeJob || running) && (
            <div className="backup-progress" role="status">
              <div className="backup-progress-head">
                <span className={`backup-status-pill status-${activeJob?.status || 'running'}`}>
                  {activeJob?.status || 'running'}
                </span>
                <span>{activeJob?.progress ?? 0}%</span>
              </div>
              <div className="progress-track backup-track">
                <span className="progress-brand" style={{ width: `${activeJob?.progress ?? 0}%` }} />
              </div>
              <p className="backup-progress-msg">{activeJob?.message || 'Starting…'}</p>
              {activeJob?.document_count != null ? (
                <p className="backup-progress-meta">{activeJob.document_count.toLocaleString()} documents · scope {activeJob.scope}</p>
              ) : null}
            </div>
          )}
        </section>

        <section className="panel backup-side">
          <div className="panel-table-heading">
            <div>
              <p className="eyebrow">RECENT JOBS</p>
              <h2>Activity</h2>
            </div>
            <button type="button" className="ghost-btn" onClick={() => void refresh()} aria-label="Refresh">
              <RefreshCw size={15} />
            </button>
          </div>
          <div className="backup-job-list">
            {loading && !jobs.length ? (
              <p className="muted">Loading…</p>
            ) : !jobs.length ? (
              <EmptyState icon={<HardDrive size={22} />} title="No jobs yet" text="Start a backup to see progress here." />
            ) : (
              jobs.slice(0, 8).map((j) => (
                <div key={j.id} className="backup-job-row">
                  <div>
                    <strong>{j.scope}</strong>
                    <span className="muted">{j.phase || j.status}</span>
                  </div>
                  <div className="backup-job-right">
                    <span className={`backup-status-pill status-${j.status}`}>{j.status}</span>
                    <span className="muted">{j.progress ?? 0}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="panel table-panel table-panel-fill backup-files">
        <div className="table-caption">
          <span>
            <strong>{files.length}</strong> archive{files.length === 1 ? '' : 's'} in storage
          </span>
          <span className="table-caption-right">Single-file gzip JSON under backend/storage/backups</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>FILE</th>
                <th>SCOPE</th>
                <th>DOCUMENTS</th>
                <th>SIZE</th>
                <th>CREATED</th>
                <th className="actions-heading">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading && !files.length ? (
                <TableSkeletonRows columns={6} rows={4} />
              ) : !files.length ? (
                <TableMessage columns={6} text="No backup files yet. Create your first snapshot above." />
              ) : (
                files.map((f) => (
                  <tr key={f.filename}>
                    <td>
                      <strong className="mono-name">{f.filename}</strong>
                      {f.until ? <div className="muted small">Until {new Date(f.until).toLocaleString()}</div> : null}
                    </td>
                    <td>{f.scope || '—'}</td>
                    <td>{f.document_count != null ? f.document_count.toLocaleString() : '—'}</td>
                    <td>{formatBytes(f.size_bytes)}</td>
                    <td>{f.created_at ? new Date(f.created_at).toLocaleString() : '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="backup-action-btn" onClick={() => void download(f.filename)} title="Download">
                          <Download size={15} />
                          <span>Download</span>
                        </button>
                        <button type="button" className="backup-action-btn danger" onClick={() => void remove(f.filename)} title="Delete">
                          <Trash2 size={15} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
