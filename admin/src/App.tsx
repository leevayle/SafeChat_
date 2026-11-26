import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Activity, ArchiveRestore, CreditCard, Flag, KeyRound, LayoutDashboard, LifeBuoy, LoaderCircle, LogOut,
  Menu, Moon, ScrollText, ShieldCheck, Sun, UserRound, Users as UsersIcon,
} from 'lucide-react'
import { login, logout, put, restoreSession, type Admin } from './api'
import { Busy, ErrorBoundary, Sk, SkTable, ToastHost, useFetch, useToast } from './ui'
import { useTheme } from './theme'
import type { Health, Overview as OverviewData } from './types'
import { Overview, OverviewSkeleton } from './pages/Overview'
import { UsersPage } from './pages/Users'
import { SupportPage } from './pages/Support'
import { ReportsPage, PaymentsPage, AccessPage } from './pages/Ops'
import { AuditPage } from './pages/Audit'
import { AccountPage } from './pages/Account'
import { BackupsPage } from './pages/Backups'

export type PageId = 'overview' | 'users' | 'access' | 'support' | 'reports' | 'payments' | 'audit' | 'backups' | 'account'
export type Go = (page: PageId, params?: Record<string, string>) => void

const NAV: { group: string; items: { id: PageId; label: string; icon: typeof Activity }[] }[] = [
  { group: 'Monitor', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
  { group: 'People', items: [{ id: 'users', label: 'Users', icon: UsersIcon }, { id: 'access', label: 'Access control', icon: KeyRound }] },
  { group: 'Moderation', items: [{ id: 'support', label: 'Support inbox', icon: LifeBuoy }, { id: 'reports', label: 'Reports', icon: Flag }] },
  { group: 'Business', items: [{ id: 'payments', label: 'Payments', icon: CreditCard }] },
  { group: 'System', items: [{ id: 'audit', label: 'Audit log', icon: ScrollText }, { id: 'backups', label: 'Backups', icon: ArchiveRestore }] },
  { group: 'You', items: [{ id: 'account', label: 'My account', icon: UserRound }] },
]
const IDLE_MS = 30 * 60 * 1000
const IDS = NAV.flatMap((g) => g.items.map((i) => i.id))
const fromHash = (): PageId => {
  const id = location.hash.replace(/^#\/?/, '').split('?')[0] as PageId
  return IDS.includes(id) ? id : 'overview'
}

function Login({ onLogin, notice }: { onLogin: (a: Admin) => void; notice?: string }) {
  const [username, setU] = useState('')
  const [password, setP] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { onLogin(await login(username.trim(), password)) } catch (x) { setErr(x instanceof Error ? x.message : 'Unable to sign in.') } finally { setBusy(false) }
  }
  return (
    <main className="login">
      <form className="card login-card" onSubmit={(e) => void submit(e)}>
        <div className="brand"><img src="/safechat-mark.svg" alt="" /><div><strong>SafeChat</strong><small>Admin</small></div></div>
        <div><h1>Welcome back</h1><p>Sign in with an authorized administrator account.</p></div>
        <label className="field"><span>Username</span><input value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" autoFocus required /></label>
        <label className="field"><span>Password</span><input type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required /></label>
        {notice && !err && <div className="callout" style={{ margin: 0 }}><ShieldCheck size={18} /><p style={{ margin: 0 }}>{notice}</p></div>}
        {err && <div className="errbox">{err}</div>}
        <button className="btn primary" disabled={busy || !username || !password}>{busy ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}Sign in</button>
        <div className="login-foot">YOUR CHATS · YOUR PEOPLE · YOUR SPACE</div>
      </form>
    </main>
  )
}

function Shell({ admin, onAdmin, onSignOut }: { admin: Admin; onAdmin: (a: Admin) => void; onSignOut: (notice?: string) => void }) {
  const [page, setPage] = useState<PageId>(fromHash)
  const [params, setParams] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const { theme, toggle } = useTheme()
  const toast = useToast()
  const ov = useFetch<OverviewData>('/admin/overview', 30_000)
  const health = useFetch<Health>('/admin/health', 30_000)

  const go: Go = useCallback((p, q = {}) => { setParams(q); setPage(p); setOpen(false); location.hash = `#/${p}` }, [])
  useEffect(() => {
    const on = () => { setPage(fromHash()); setParams({}) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  // Presence lets the backend route new support tickets to admins who are online.
  useEffect(() => {
    const beat = () => void put('/admin/presence').catch(() => {})
    beat()
    const t = setInterval(beat, 45_000)
    return () => clearInterval(t)
  }, [])

  // Security: end the session after 30 minutes without interaction.
  useEffect(() => {
    let last = Date.now()
    const bump = () => { last = Date.now() }
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const t = setInterval(() => {
      if (Date.now() - last > IDLE_MS) { void logout().catch(() => {}).finally(() => onSignOut('You were signed out after 30 minutes of inactivity.')) }
    }, 30_000)
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); clearInterval(t) }
  }, [onSignOut])

  // Show open work in the browser tab title.
  const attention = (ov.data?.support_tickets_open ?? 0) + (ov.data?.reports_open ?? 0)
  useEffect(() => { document.title = `${attention ? `(${attention}) ` : ''}SafeChat Admin` }, [attention])

  const badge: Partial<Record<PageId, number>> = {
    support: ov.data?.support_tickets_open, reports: ov.data?.reports_open, users: ov.data?.users.pending_review,
  }
  const online = health.data?.api === 'online' && health.data?.mongodb === 'online'
  const current = NAV.flatMap((g) => g.items).find((i) => i.id === page)!

  const out = async () => { try { await logout() } catch { toast('Signed out locally; the server could not confirm.', 'err') } onSignOut() }

  return (
    <div className="shell">
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Primary">
        <div className="brand"><img src="/safechat-mark.svg" alt="" /><div><strong>SafeChat</strong><small>Admin</small></div></div>
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="nav-group">{g.group}</div>
            {g.items.map(({ id, label, icon: Icon }) => (
              <button key={id} className={`nav ${page === id ? 'on' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}>
                <Icon size={19} />{label}{!!badge[id] && <span className="count">{badge[id]}</span>}
              </button>
            ))}
          </div>
        ))}
        <div className="side-foot">
          <button className="me me-btn" onClick={() => go('account')} aria-label="Open my account"><span className="avatar">{(admin.display_name || admin.username)[0]?.toUpperCase()}</span>
            <div><strong>{admin.display_name || admin.username}</strong><small>@{admin.username} · {admin.role === 'SUPER_ADMIN' ? 'Superadmin' : 'Admin'}</small></div></button>
          <button className="btn ghost sm" onClick={() => void out()}><LogOut size={15} />Sign out</button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <strong className="grow">{current.label}</strong>
          {!health.data
            ? <Sk w={150} h={14} r={99} />
            : <span className={`live ${online ? '' : 'off'}`}><i />{online ? 'All systems normal' : 'Service issue'}</span>}
          <button className="icon-btn" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggle}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>
        </div>
        <div className="content" key={page}><ErrorBoundary>
          {page === 'overview' && <Overview ov={ov.data} health={health.data} error={ov.error} reload={() => { void ov.reload(); void health.reload() }} go={go} />}
          {page === 'users' && <UsersPage admin={admin} initialStatus={params.status} />}
          {page === 'access' && <AccessPage admin={admin} />}
          {page === 'support' && <SupportPage />}
          {page === 'reports' && <ReportsPage />}
          {page === 'payments' && <PaymentsPage />}
          {page === 'audit' && <AuditPage admin={admin} />}
          {page === 'backups' && <BackupsPage />}
          {page === 'account' && <AccountPage admin={admin} onAdmin={onAdmin} onSignedOut={onSignOut} />}
        </ErrorBoundary></div>
      </div>
    </div>
  )
}

/** Shown while the saved session is checked on load: a wireframe of the real shell (sidebar, top bar, page). */
function AppSkeleton() {
  const groups = [1, 2, 2, 1, 2, 1]
  const onOverview = fromHash() === 'overview'
  return (
    <div className="shell">
      <aside className="side" aria-hidden>
        <div className="brand"><Sk w={36} h={36} r={10} className="flex-none" /><div style={{ display: 'grid', gap: 6 }}><Sk w={84} h={16} /><Sk w={44} h={9} /></div></div>
        {groups.map((n, g) => (
          <div key={g}>
            <Sk w={64} h={10} style={{ margin: '14px 10px 6px' }} />
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="nav" style={{ pointerEvents: 'none' }}><Sk w={19} h={19} r={6} className="flex-none" /><Sk w={72 + ((g * 3 + i * 5) % 5) * 14} h={14} /></div>))}
          </div>))}
        <div className="side-foot"><div className="me"><Sk w={38} h={38} r={12} className="flex-none" /><div style={{ display: 'grid', gap: 6 }}><Sk w={96} h={13} /><Sk w={72} h={10} /></div></div><Sk w={96} h={32} r={10} /></div>
      </aside>
      <div className="main">
        <div className="topbar" aria-hidden><Sk w={120} h={18} /><span className="grow" /><Sk w={150} h={14} r={99} /><Sk w={38} h={38} r={11} /></div>
        <Busy label="Loading the admin portal" className="content">
          <header className="page-head"><div style={{ display: 'grid', gap: 8 }}><Sk w={78} h={10} /><Sk w={230} h={30} /><Sk w={300} h={14} /></div></header>
          {onOverview ? <OverviewSkeleton /> : <div className="card"><SkTable cols={[{ h: '', kind: 'user' }, { h: '', kind: 'two' }, { h: '', kind: 'pill' }, { h: '', kind: 'short' }]} rows={7} /></div>}
        </Busy>
      </div>
    </div>
  )
}

export default function App() {
  const [admin, setAdmin] = useState<Admin | null | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>()
  useEffect(() => { void restoreSession().then(setAdmin) }, [])
  useEffect(() => {
    const expired = () => setAdmin(null)
    window.addEventListener('admin:session-expired', expired)
    return () => window.removeEventListener('admin:session-expired', expired)
  }, [])
  const signedOut = useCallback((msg?: string) => { setNotice(msg); setAdmin(null); location.hash = '' }, [])
  if (admin === undefined) return <AppSkeleton />
  return <ToastHost>{admin ? <Shell admin={admin} onAdmin={setAdmin} onSignOut={signedOut} /> : <Login notice={notice} onLogin={(a) => { setNotice(undefined); setAdmin(a) }} />}</ToastHost>
}
